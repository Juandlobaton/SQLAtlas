"""Infrastructure: Base class for dialect-specific flow tree engines.

Provides shared infrastructure (stack management, node creation) and
dialect-agnostic handlers (DML, DECLARE, control flow with permissive
block-keyword detection).
"""

from __future__ import annotations

import logging
import re
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import TYPE_CHECKING

from src.domain.entities.flow_node import FlowNode

if TYPE_CHECKING:
    from collections.abc import Callable

logger = logging.getLogger(__name__)

# ── Shared regex patterns for metadata extraction ──

_TABLE_FROM_PATTERN = re.compile(
    r"\b(?:FROM|JOIN)\s+((?:\[?\w+\]?\.)*\[?\w+\]?)", re.IGNORECASE,
)
_TABLE_INTO_PATTERN = re.compile(
    r"\bINTO\s+((?:\[?\w+\]?\.)*\[?\w+\]?)", re.IGNORECASE,
)
_TABLE_UPDATE_PATTERN = re.compile(
    r"\bUPDATE\s+((?:\[?\w+\]?\.)*\[?\w+\]?)", re.IGNORECASE,
)
_TABLE_DELETE_PATTERN = re.compile(
    r"\bDELETE\s+(?:FROM\s+)?((?:\[?\w+\]?\.)*\[?\w+\]?)", re.IGNORECASE,
)
_TABLE_MERGE_PATTERN = re.compile(
    r"\bMERGE\s+(?:INTO\s+)?((?:\[?\w+\]?\.)*\[?\w+\]?)", re.IGNORECASE,
)

_EXEC_PROC_PATTERN = re.compile(
    r"\b(?:EXEC(?:UTE)?|CALL|PERFORM)\s+((?:\[?\w+\]?\.)*\[?\w+\]?)", re.IGNORECASE,
)

_SET_ASSIGN_PATTERN = re.compile(
    r"\bSET\s+(@\w+)\s*=\s*(.+)", re.IGNORECASE | re.DOTALL,
)

_DECLARE_PATTERN = re.compile(
    r"\bDECLARE\s+(@\w+)\s+([\w]+(?:\([^)]*\))?)", re.IGNORECASE,
)

_DECLARE_PLSQL_PATTERN = re.compile(
    r"^\s*(\w+)\s+([\w]+(?:\([^)]*\))?)\s*(?::=|;|DEFAULT)", re.IGNORECASE,
)

_DECLARE_CURSOR_PATTERN = re.compile(
    r"\bDECLARE\s+(\w+)\s+CURSOR\b", re.IGNORECASE,
)

_SELECT_INTO_VAR_PATTERN = re.compile(
    r"\bSELECT\s+(.+?)\s+(?:BULK\s+COLLECT\s+)?INTO\s+([@\w]+)",
    re.IGNORECASE | re.DOTALL,
)

_SELECT_ASSIGN_PATTERN = re.compile(
    r"\bSELECT\s+(@\w+)\s*=", re.IGNORECASE,
)

_IF_CONDITION_PATTERN = re.compile(
    r"\bIF\s+(.+?)(?:\s*(?:BEGIN|THEN)\s*$|\s*$)", re.IGNORECASE | re.DOTALL,
)

_WHILE_CONDITION_PATTERN = re.compile(
    r"\bWHILE\s+(.+?)(?:\s*BEGIN\s*$|\s*$)", re.IGNORECASE | re.DOTALL,
)

_NON_TABLE_KEYWORDS = frozenset({
    "SET", "BEGIN", "END", "THEN", "AS", "ON", "AND", "OR", "NOT",
    "NULL", "WHERE", "VALUES", "SELECT", "EXEC", "EXECUTE", "DECLARE",
    "IF", "ELSE", "WHILE", "FOR", "RETURN", "OUTPUT", "INSERTED",
    "DELETED", "TOP", "DISTINCT", "CASE", "WHEN", "EXISTS",
})

_CONTROL_KEYWORDS = re.compile(
    r"^\s*\b(IF|ELSIF|ELSE|WHEN|WHILE|FOR|FORALL|LOOP|BEGIN|END|DECLARE|SET|SELECT|INSERT|UPDATE|"
    r"DELETE|MERGE|EXEC|EXECUTE|CALL|PERFORM|RETURN|RAISE|RAISERROR|THROW|PRINT|"
    r"BREAK|CONTINUE|EXIT|GOTO|WAITFOR|OPEN|CLOSE|FETCH|DEALLOCATE|CURSOR|"
    r"CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|DENY|COMMIT|ROLLBACK|"
    r"SAVE|BEGIN\s+TRY|BEGIN\s+CATCH|END\s+TRY|END\s+CATCH|EXCEPTION)\b",
    re.IGNORECASE,
)

# ── Variable extraction helpers ──

_VAR_PATTERN = re.compile(r"@@?\w+", re.IGNORECASE)

_PLSQL_VAR_PATTERN = re.compile(r"\b([vplcio]_\w+)\b", re.IGNORECASE)


def extract_variables_tsql(text: str) -> list[str]:
    """Extract @variables from text (T-SQL style)."""
    return list(dict.fromkeys(m.group() for m in _VAR_PATTERN.finditer(text)))


def extract_variables_plsql(text: str) -> list[str]:
    """Extract variables from PL/SQL or PL/pgSQL text."""
    results = list(dict.fromkeys(m.group(1) for m in _PLSQL_VAR_PATTERN.finditer(text)))
    for m in _VAR_PATTERN.finditer(text):
        if m.group() not in results:
            results.append(m.group())
    return results


# ── Shared utilities ──

def _clean_table_name(name: str) -> str:
    return name.replace("[", "").replace("]", "").strip()


def _is_valid_table(name: str) -> bool:
    clean = _clean_table_name(name).upper().split(".")[-1]
    return bool(clean) and clean not in _NON_TABLE_KEYWORDS and not clean.startswith("@")


def _extract_tables(text: str) -> list[str]:
    tables: list[str] = []
    for pattern in (_TABLE_FROM_PATTERN, _TABLE_INTO_PATTERN, _TABLE_UPDATE_PATTERN,
                    _TABLE_DELETE_PATTERN, _TABLE_MERGE_PATTERN):
        for m in pattern.finditer(text):
            name = _clean_table_name(m.group(1))
            if _is_valid_table(name) and name not in tables:
                tables.append(name)
    return tables


# ── Stack frame ──

@dataclass
class StackFrame:
    """Tracks current nesting context during flow tree parsing."""
    node: FlowNode
    block_type: str  # root, if_true, if_false, while, try, catch, begin, exception, when_handler
    target_list: str  # children, true_branch, false_branch
    expects_end: bool = False
    is_single_line: bool = False


# ── Base engine ──

class FlowBuilderBase(ABC):
    """Abstract base for dialect-specific flow tree engines."""

    def __init__(self, sql: str) -> None:
        self._sql = sql
        self._lines: list[str] = sql.split("\n")
        self._counter = 0
        self._stack: list[StackFrame] = []
        self._handler_chain: list[Callable] = self._get_handler_chain()

    @property
    @abstractmethod
    def dialect_name(self) -> str: ...

    @abstractmethod
    def _vars(self, text: str) -> list[str]:
        """Extract variables using dialect-appropriate patterns."""

    @abstractmethod
    def _get_handler_chain(self) -> list[Callable]:
        """Return ordered list of handler methods for this dialect."""

    # ── Stack infrastructure ──

    def _next_id(self) -> str:
        self._counter += 1
        return f"n{self._counter}"

    def _current_frame(self) -> StackFrame:
        return self._stack[-1]

    def _append_node(self, node: FlowNode) -> None:
        frame = self._current_frame()
        parent = frame.node

        if frame.target_list == "children":
            parent.children.append(node)
        elif frame.target_list == "true_branch":
            if parent.true_branch is None:
                parent.true_branch = FlowNode(
                    node_id=f"{parent.node_id}_true",
                    node_type="branch", label="Then",
                )
            parent.true_branch.children.append(node)
        elif frame.target_list == "false_branch":
            if parent.false_branch is None:
                parent.false_branch = FlowNode(
                    node_id=f"{parent.node_id}_false",
                    node_type="branch", label="Else",
                )
            parent.false_branch.children.append(node)

        if frame.is_single_line and frame.block_type in ("if_true", "if_false"):
            self._stack.pop()

    def _find_if_node_for_else(self) -> FlowNode | None:
        children = self._get_current_target_list()
        if children:
            for child in reversed(children):
                if child.node_type == "condition" and child.false_branch is None:
                    return child

        frame = self._current_frame()
        if frame.block_type in ("if_true", "if_false"):
            popped = self._stack.pop()
            return popped.node

        return None

    def _pop_frames_until(self, target_types: tuple[str, ...]) -> None:
        while len(self._stack) > 1:
            frame = self._current_frame()
            if frame.block_type in target_types:
                self._stack.pop()
                return
            if frame.block_type in ("when_handler",):
                self._stack.pop()
                continue
            return

    def _get_current_target_list(self) -> list[FlowNode]:
        frame = self._current_frame()
        parent = frame.node
        if frame.target_list == "children":
            return parent.children
        if frame.target_list == "true_branch":
            return parent.true_branch.children if parent.true_branch else []
        if frame.target_list == "false_branch":
            return parent.false_branch.children if parent.false_branch else []
        return []

    def _accumulate_statement(self, start_idx: int) -> tuple[str, int]:
        lines_acc = [self._lines[start_idx].strip()]
        i = start_idx + 1
        while i < len(self._lines):
            line = self._lines[i].strip()
            if not line or line.startswith(("--", "/*")):
                i += 1
                continue
            upper = line.upper()
            if _CONTROL_KEYWORDS.match(line):
                break
            end_kws = ("END", "END TRY", "END CATCH", "END LOOP", "END IF", ")")
            if upper.rstrip(";").strip() in end_kws:
                break
            lines_acc.append(line)
            i += 1
        return "\n".join(lines_acc), i - 1

    def _peek_next_meaningful(self, start: int) -> int | None:
        i = start
        while i < len(self._lines):
            line = self._lines[i].strip()
            if line and not line.startswith("--") and not line.startswith("/*"):
                return i
            i += 1
        return None

    # ── Parse entry point ──

    def parse(self) -> FlowNode:
        root = FlowNode(
            node_id="start", node_type="start", label="Start", line_number=1,
        )
        self._stack = [StackFrame(
            node=root, block_type="root", target_list="children",
        )]

        i = 0
        while i < len(self._lines):
            i = self._classify_and_create(i)

        while len(self._stack) > 1:
            self._stack.pop()

        root.children.append(FlowNode(
            node_id="end", node_type="end", label="End",
            line_number=len(self._lines),
        ))
        return root

    def _classify_and_create(self, line_idx: int) -> int:
        raw_line = self._lines[line_idx]
        stripped = raw_line.strip()
        upper = stripped.upper()
        line_num = line_idx + 1

        if not stripped or stripped.startswith(("--", "/*")):
            return line_idx + 1

        for handler in self._handler_chain:
            result = handler(line_idx, stripped, upper, line_num)
            if result is not None:
                return result

        return line_idx + 1

    # ── Shared control flow handlers ──

    def _handle_elsif_or_elseif(self, line_idx: int, stripped: str,

            upper: str, line_num: int) -> int | None:
        if not re.match(r"\b(?:ELSE\s+IF|ELSIF)\b", upper):
            return None

        if_node = self._find_if_node_for_else()

        cond_match = re.match(
            r"\b(?:ELSE\s+IF|ELSIF)\s+(.+?)(?:\s*(?:BEGIN|THEN)\s*$|\s*$)",
            stripped, re.IGNORECASE,
        )
        cond_text = cond_match.group(1).strip() if cond_match else stripped
        has_begin = upper.rstrip().endswith("BEGIN") or upper.rstrip().endswith("THEN")

        node = FlowNode(
            node_id=self._next_id(), node_type="condition",
            label=stripped[:120], line_number=line_num,
            operation="ELSIF" if "ELSIF" in upper else "ELSE IF",
            condition=cond_text, expression=cond_text,
            variables_read=self._vars(cond_text), sql_snippet=stripped,
        )

        if if_node and if_node.node_type == "condition":
            if if_node.false_branch is None:
                if_node.false_branch = FlowNode(
                    node_id=f"{if_node.node_id}_false",
                    node_type="branch", label="Else",
                )
            if_node.false_branch.children.append(node)
        else:
            self._append_node(node)

        if not has_begin:
            next_begin = self._peek_next_meaningful(line_idx + 1)
            if next_begin is not None:
                next_upper = self._lines[next_begin].strip().upper()
                has_begin = next_upper in ("BEGIN", "THEN")
                if has_begin:
                    self._stack.append(StackFrame(
                        node=node, block_type="if_true",
                        target_list="true_branch", expects_end=True,
                    ))
                    return next_begin + 1

        if has_begin:
            self._stack.append(StackFrame(
                node=node, block_type="if_true",
                target_list="true_branch", expects_end=True,
            ))
        else:
            self._stack.append(StackFrame(
                node=node, block_type="if_true",
                target_list="true_branch", is_single_line=True,
            ))
        return line_idx + 1

    def _handle_else(self, line_idx: int, _stripped: str,

            upper: str, _line_num: int) -> int | None:
        if not re.match(r"\bELSE\b", upper) or re.match(r"\bELSE\s+IF\b", upper):
            return None

        if_node = self._find_if_node_for_else()
        if if_node is None:
            return line_idx + 1

        has_begin = upper.rstrip().endswith("BEGIN")
        if not has_begin:
            next_begin = self._peek_next_meaningful(line_idx + 1)
            has_begin = (
                next_begin is not None
                and self._lines[next_begin].strip().upper() == "BEGIN"
            )
            if has_begin:
                self._stack.append(StackFrame(
                    node=if_node, block_type="if_false",
                    target_list="false_branch", expects_end=True,
                ))
                return next_begin + 1

        if has_begin:
            self._stack.append(StackFrame(
                node=if_node, block_type="if_false",
                target_list="false_branch", expects_end=True,
            ))
        else:
            self._stack.append(StackFrame(
                node=if_node, block_type="if_false",
                target_list="false_branch", is_single_line=True,
            ))
        return line_idx + 1

    def _handle_if(self, line_idx: int, stripped: str,

            upper: str, line_num: int) -> int | None:
        if not re.match(r"\bIF\b", upper):
            return None
        if re.match(r"\bIF\s+EXISTS\b", upper) or re.match(r"\bELSIF\b", upper):
            return None

        cond_match = _IF_CONDITION_PATTERN.match(stripped)
        cond_text = cond_match.group(1).strip() if cond_match else stripped
        has_begin = upper.rstrip().endswith("BEGIN") or upper.rstrip().endswith("THEN")

        node = FlowNode(
            node_id=self._next_id(), node_type="condition",
            label=stripped[:120], line_number=line_num,
            operation="IF", condition=cond_text, expression=cond_text,
            variables_read=self._vars(cond_text), sql_snippet=stripped,
        )
        self._append_node(node)

        if not has_begin:
            next_begin = self._peek_next_meaningful(line_idx + 1)
            if next_begin is not None:
                next_upper = self._lines[next_begin].strip().upper()
                has_begin = next_upper in ("BEGIN", "THEN")
                if has_begin:
                    self._stack.append(StackFrame(
                        node=node, block_type="if_true",
                        target_list="true_branch", expects_end=True,
                    ))
                    return next_begin + 1

        if has_begin:
            self._stack.append(StackFrame(
                node=node, block_type="if_true",
                target_list="true_branch", expects_end=True,
            ))
        else:
            self._stack.append(StackFrame(
                node=node, block_type="if_true",
                target_list="true_branch", is_single_line=True,
            ))
        return line_idx + 1

    def _handle_if_exists(self, line_idx: int, stripped: str,

            upper: str, line_num: int) -> int | None:
        if not re.match(r"\bIF\s+EXISTS\b", upper):
            return None

        full_text, end_idx = self._accumulate_statement(line_idx)
        tables = _extract_tables(full_text)
        all_vars = self._vars(full_text)

        node = FlowNode(
            node_id=self._next_id(), node_type="condition",
            label=stripped[:120], line_number=line_num,
            operation="IF", condition=stripped, expression=stripped,
            affected_tables=tables, variables_read=all_vars,
            sql_snippet=full_text[:500],
        )
        self._append_node(node)

        has_begin = upper.rstrip().endswith("BEGIN")
        if not has_begin:
            next_begin = self._peek_next_meaningful(end_idx + 1)
            has_begin = (
                next_begin is not None
                and self._lines[next_begin].strip().upper() == "BEGIN"
            )
            if has_begin:
                self._stack.append(StackFrame(
                    node=node, block_type="if_true",
                    target_list="true_branch", expects_end=True,
                ))
                return next_begin + 1

        if has_begin:
            self._stack.append(StackFrame(
                node=node, block_type="if_true",
                target_list="true_branch", expects_end=True,
            ))
        else:
            self._stack.append(StackFrame(
                node=node, block_type="if_true",
                target_list="true_branch", is_single_line=True,
            ))
        return end_idx + 1

    def _handle_while_for(self, line_idx: int, stripped: str,

            upper: str, line_num: int) -> int | None:
        if not re.match(r"\b(WHILE|FOR)\b", upper):
            return None

        cond_match = _WHILE_CONDITION_PATTERN.match(stripped)
        cond_text = cond_match.group(1).strip() if cond_match else stripped
        cond_text = re.sub(r"\s+LOOP\s*$", "", cond_text, flags=re.IGNORECASE).strip()
        op = "WHILE" if upper.startswith("WHILE") else "FOR"

        node = FlowNode(
            node_id=self._next_id(), node_type="loop",
            label=stripped[:120], line_number=line_num,
            operation=op, condition=cond_text, expression=cond_text,
            variables_read=self._vars(cond_text), sql_snippet=stripped,
        )
        self._append_node(node)

        has_block = upper.rstrip().endswith("BEGIN") or upper.rstrip().endswith("LOOP")
        if not has_block:
            next_line = self._peek_next_meaningful(line_idx + 1)
            if next_line is not None:
                next_upper = self._lines[next_line].strip().upper()
                has_block = next_upper in ("BEGIN", "LOOP")
                if has_block:
                    self._stack.append(StackFrame(
                        node=node, block_type="while",
                        target_list="children", expects_end=True,
                    ))
                    return next_line + 1

        self._stack.append(StackFrame(
            node=node, block_type="while",
            target_list="children", expects_end=has_block,
            is_single_line=not has_block,
        ))
        return line_idx + 1

    def _handle_end_generic(self, line_idx: int, _stripped: str,

            upper: str, _line_num: int) -> int | None:
        if not re.match(r"\bEND\b", upper):
            return None
        if re.match(r"\bEND\s+(TRY|CATCH|IF|LOOP)\b", upper):
            return None

        if len(self._stack) > 1:
            while len(self._stack) > 1:
                frame = self._current_frame()
                if frame.block_type in ("when_handler",):
                    self._stack.pop()
                    continue
                if frame.block_type == "exception":
                    self._stack.pop()
                    if len(self._stack) > 1 and self._current_frame().block_type == "begin":
                        self._stack.pop()
                    break
                if frame.expects_end or frame.block_type in (
                    "if_true", "if_false", "while", "begin", "try", "catch",
                ):
                    self._stack.pop()
                    break
                break
        return line_idx + 1

    def _handle_begin_standalone(self, line_idx: int,
            _stripped: str, upper: str,
            _line_num: int) -> int | None:
        _begin_re = r"\bBEGIN\s+(TRY|CATCH|TRAN|TRANSACTION)\b"
        if not (
            upper == "BEGIN"
            or (upper.startswith("BEGIN") and not re.match(_begin_re, upper))
        ):
            return None

        if len(self._stack) > 0 and self._current_frame().block_type == "root":
            self._stack.append(StackFrame(
                node=self._current_frame().node,
                block_type="begin", target_list="children", expects_end=True,
            ))
        return line_idx + 1

    # ── Shared DML / statement handlers ──

    def _handle_dml(self, line_idx: int, stripped: str, upper: str, line_num: int,
                    keyword: str, operation: str) -> int | None:
        if not re.match(rf"\b{keyword}\b", upper):
            return None
        full_text, end_idx = self._accumulate_statement(line_idx)
        tables = _extract_tables(full_text)
        all_vars = self._vars(full_text)
        node = FlowNode(
            node_id=self._next_id(), node_type="statement",
            label=stripped[:120], line_number=line_num,
            operation=operation, affected_tables=tables,
            variables_read=all_vars, sql_snippet=full_text[:500],
        )
        self._append_node(node)
        return end_idx + 1

    def _handle_insert(self, line_idx: int, stripped: str,

            upper: str, line_num: int) -> int | None:
        return self._handle_dml(line_idx, stripped, upper, line_num, "INSERT", "INSERT")

    def _handle_update(self, line_idx: int, stripped: str,

            upper: str, line_num: int) -> int | None:
        return self._handle_dml(line_idx, stripped, upper, line_num, "UPDATE", "UPDATE")

    def _handle_delete(self, line_idx: int, stripped: str,

            upper: str, line_num: int) -> int | None:
        return self._handle_dml(line_idx, stripped, upper, line_num, "DELETE", "DELETE")

    def _handle_merge(self, line_idx: int, stripped: str,

            upper: str, line_num: int) -> int | None:
        return self._handle_dml(line_idx, stripped, upper, line_num, "MERGE", "MERGE")

    def _handle_select_assignment(self, line_idx: int, stripped: str,

            upper: str, line_num: int) -> int | None:
        if not re.match(r"\bSELECT\b", upper):
            return None
        has_assign = _SELECT_ASSIGN_PATTERN.search(stripped)
        has_into = _SELECT_INTO_VAR_PATTERN.search(stripped)
        if not (has_assign or has_into):
            return None

        full_text, end_idx = self._accumulate_statement(line_idx)
        tables = _extract_tables(full_text)
        all_vars = self._vars(full_text)

        vars_written = [m.group(1) for m in _SELECT_ASSIGN_PATTERN.finditer(full_text)]
        for m in _SELECT_INTO_VAR_PATTERN.finditer(full_text):
            if m.group(2) not in vars_written:
                vars_written.append(m.group(2))
        vars_read = [v for v in all_vars if v not in vars_written]

        node = FlowNode(
            node_id=self._next_id(), node_type="statement",
            label=stripped[:120], line_number=line_num,
            operation="SELECT", affected_tables=tables,
            variables_written=vars_written, variables_read=vars_read,
            sql_snippet=full_text[:500],
        )
        self._append_node(node)
        return end_idx + 1

    def _handle_exec_call(self, line_idx: int, stripped: str,

            upper: str, line_num: int) -> int | None:
        if not re.match(r"\b(EXEC|EXECUTE|CALL|PERFORM)\b", upper):
            return None

        full_text, end_idx = self._accumulate_statement(line_idx)
        proc_match = _EXEC_PROC_PATTERN.match(full_text)
        target_proc = _clean_table_name(proc_match.group(1)) if proc_match else None
        vars_read = self._vars(full_text)

        node = FlowNode(
            node_id=self._next_id(), node_type="call",
            label=stripped[:120], line_number=line_num,
            operation="PERFORM" if "PERFORM" in upper else "EXEC",
            target_procedure=target_proc, variables_read=vars_read,
            sql_snippet=full_text[:500],
        )
        self._append_node(node)
        return end_idx + 1

    def _handle_select(self, line_idx: int, stripped: str,

            upper: str, line_num: int) -> int | None:
        if not (re.match(r"\bSELECT\s+.*\bINTO\b", upper) or re.match(r"\bSELECT\b", upper)):
            return None

        full_text, end_idx = self._accumulate_statement(line_idx)
        tables = _extract_tables(full_text)
        all_vars = self._vars(full_text)

        node = FlowNode(
            node_id=self._next_id(), node_type="statement",
            label=stripped[:120], line_number=line_num,
            operation="SELECT", affected_tables=tables,
            variables_read=all_vars, sql_snippet=full_text[:500],
        )
        self._append_node(node)
        return end_idx + 1

    def _handle_return(self, line_idx: int, stripped: str,

            upper: str, line_num: int) -> int | None:
        if not re.match(r"\bRETURN\b", upper):
            return None
        vars_read = self._vars(stripped)
        node = FlowNode(
            node_id=self._next_id(), node_type="return",
            label=stripped[:120], line_number=line_num,
            operation="RETURN", variables_read=vars_read, sql_snippet=stripped,
        )
        self._append_node(node)
        return line_idx + 1

    def _handle_declare_cursor(self, line_idx: int, stripped: str,

            _upper: str, line_num: int) -> int | None:
        if not _DECLARE_CURSOR_PATTERN.match(stripped):
            return None
        full_text, end_idx = self._accumulate_statement(line_idx)
        cursor_m = _DECLARE_CURSOR_PATTERN.match(stripped)
        cursor_name = cursor_m.group(1) if cursor_m else "cursor"
        tables = _extract_tables(full_text)
        node = FlowNode(
            node_id=self._next_id(), node_type="statement",
            label=f"DECLARE {cursor_name} CURSOR", line_number=line_num,
            operation="DECLARE", affected_tables=tables,
            variables_written=[cursor_name], sql_snippet=full_text[:500],
        )
        self._append_node(node)
        return end_idx + 1

    def _handle_declare(self, line_idx: int, stripped: str,

            upper: str, line_num: int) -> int | None:
        if not re.match(r"\bDECLARE\b", upper):
            return None
        full_text, end_idx = self._accumulate_statement(line_idx)
        vars_written: list[str] = []
        for m in _DECLARE_PATTERN.finditer(full_text):
            vars_written.append(m.group(1))
        if not vars_written:
            vars_written = self._vars(full_text)

        frame = self._current_frame()
        parent_children = frame.node.children
        if parent_children and parent_children[-1].operation == "DECLARE":
            prev = parent_children[-1]
            prev.variables_written = list(set((prev.variables_written or []) + vars_written))
            prev.label = f"DECLARE {', '.join(prev.variables_written)}"[:120]
            prev.sql_snippet = ((prev.sql_snippet or "") + "\n" + full_text)[:500]
            return end_idx + 1

        node = FlowNode(
            node_id=self._next_id(), node_type="statement",
            label=stripped[:120], line_number=line_num,
            operation="DECLARE", variables_written=vars_written,
            sql_snippet=full_text[:500],
        )
        self._append_node(node)
        return end_idx + 1

    def _handle_set(self, line_idx: int, stripped: str,

            upper: str, line_num: int) -> int | None:
        if not re.match(r"\bSET\b", upper):
            return None
        full_text, end_idx = self._accumulate_statement(line_idx)
        set_match = _SET_ASSIGN_PATTERN.match(full_text)
        var_written = set_match.group(1) if set_match else None
        expression = set_match.group(2).strip()[:200] if set_match else None
        vars_read = self._vars(expression) if expression else []
        if var_written and var_written in vars_read:
            vars_read = [v for v in vars_read if v != var_written]

        frame = self._current_frame()
        prev_list = frame.node.children
        if prev_list and prev_list[-1].operation == "SET":
            prev = prev_list[-1]
            if var_written:
                prev.variables_written = list(set((prev.variables_written or []) + [var_written]))
            prev.variables_read = list(set((prev.variables_read or []) + vars_read))
            prev.label = f"SET {', '.join(prev.variables_written)}"[:120]
            prev.sql_snippet = ((prev.sql_snippet or "") + "\n" + full_text)[:500]
            return end_idx + 1

        node = FlowNode(
            node_id=self._next_id(), node_type="statement",
            label=stripped[:120], line_number=line_num,
            operation="SET", expression=expression,
            variables_written=[var_written] if var_written else [],
            variables_read=vars_read, sql_snippet=full_text[:500],
        )
        self._append_node(node)
        return end_idx + 1

    def _handle_transaction(self, line_idx: int, stripped: str,

            upper: str, line_num: int) -> int | None:
        if not re.match(r"\b(BEGIN\s+TRAN(?:SACTION)?|COMMIT|ROLLBACK|SAVE\s+TRAN)\b", upper):
            return None
        if "COMMIT" in upper:
            op = "COMMIT"
        elif "ROLLBACK" in upper:
            op = "ROLLBACK"
        else:
            op = "BEGIN TRANSACTION"
        node = FlowNode(
            node_id=self._next_id(), node_type="statement",
            label=stripped[:120], line_number=line_num,
            operation=op, sql_snippet=stripped,
        )
        self._append_node(node)
        return line_idx + 1

    def _handle_cursor_ops(self, line_idx: int, stripped: str,

            upper: str, line_num: int) -> int | None:
        if not re.match(r"\b(OPEN|CLOSE|FETCH|DEALLOCATE)\b", upper):
            return None
        full_text, end_idx = self._accumulate_statement(line_idx)
        vars_read = self._vars(full_text)
        op = upper.split()[0]
        node = FlowNode(
            node_id=self._next_id(), node_type="statement",
            label=stripped[:120], line_number=line_num,
            operation=op, variables_read=vars_read,
            sql_snippet=full_text[:500],
        )
        self._append_node(node)
        return end_idx + 1

    def _handle_truncate(self, line_idx: int, stripped: str,

            upper: str, line_num: int) -> int | None:
        if not re.match(r"\bTRUNCATE\b", upper):
            return None
        tables = _extract_tables(stripped)
        node = FlowNode(
            node_id=self._next_id(), node_type="statement",
            label=stripped[:120], line_number=line_num,
            operation="TRUNCATE", affected_tables=tables, sql_snippet=stripped,
        )
        self._append_node(node)
        return line_idx + 1
