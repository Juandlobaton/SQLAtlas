"""Infrastructure: Flow tree builder using regex + SQLGlot AST hybrid.

Builds a hierarchical flow tree from SQL source code with proper nesting
for IF/ELSE, WHILE, TRY/CATCH blocks, and per-node metadata extraction.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field

import sqlglot
from sqlglot import exp

from src.domain.entities.complexity import ComplexityMetrics
from src.domain.entities.flow_node import FlowNode
from src.domain.services.flow_builder import IFlowBuilder

logger = logging.getLogger(__name__)

# ── Regex patterns for metadata extraction ──

_VAR_PATTERN = re.compile(r"@\w+", re.IGNORECASE)

_TABLE_FROM_PATTERN = re.compile(
    r"\b(?:FROM|JOIN)\s+((?:\[?\w+\]?\.)*\[?\w+\]?)",
    re.IGNORECASE,
)
_TABLE_INTO_PATTERN = re.compile(
    r"\bINTO\s+((?:\[?\w+\]?\.)*\[?\w+\]?)",
    re.IGNORECASE,
)
_TABLE_UPDATE_PATTERN = re.compile(
    r"\bUPDATE\s+((?:\[?\w+\]?\.)*\[?\w+\]?)",
    re.IGNORECASE,
)
_TABLE_DELETE_PATTERN = re.compile(
    r"\bDELETE\s+(?:FROM\s+)?((?:\[?\w+\]?\.)*\[?\w+\]?)",
    re.IGNORECASE,
)
_TABLE_MERGE_PATTERN = re.compile(
    r"\bMERGE\s+(?:INTO\s+)?((?:\[?\w+\]?\.)*\[?\w+\]?)",
    re.IGNORECASE,
)

_EXEC_PROC_PATTERN = re.compile(
    r"\b(?:EXEC(?:UTE)?|CALL)\s+((?:\[?\w+\]?\.)*\[?\w+\]?)",
    re.IGNORECASE,
)

_SET_ASSIGN_PATTERN = re.compile(
    r"\bSET\s+(@\w+)\s*=\s*(.+)",
    re.IGNORECASE | re.DOTALL,
)

_DECLARE_PATTERN = re.compile(
    r"\bDECLARE\s+(@\w+)\s+([\w]+(?:\([^)]*\))?)",
    re.IGNORECASE,
)

_SELECT_INTO_VAR_PATTERN = re.compile(
    r"\bSELECT\s+(.+?)\s+INTO\s+(@\w+)",
    re.IGNORECASE | re.DOTALL,
)

_SELECT_ASSIGN_PATTERN = re.compile(
    r"\bSELECT\s+(@\w+)\s*=",
    re.IGNORECASE,
)

_IF_CONDITION_PATTERN = re.compile(
    r"\bIF\s+(.+?)(?:\s*BEGIN\s*$|\s*$)",
    re.IGNORECASE | re.DOTALL,
)

_WHILE_CONDITION_PATTERN = re.compile(
    r"\bWHILE\s+(.+?)(?:\s*BEGIN\s*$|\s*$)",
    re.IGNORECASE | re.DOTALL,
)

# Keywords that exclude a name from being a table
_NON_TABLE_KEYWORDS = frozenset({
    "SET", "BEGIN", "END", "THEN", "AS", "ON", "AND", "OR", "NOT",
    "NULL", "WHERE", "VALUES", "SELECT", "EXEC", "EXECUTE", "DECLARE",
    "IF", "ELSE", "WHILE", "FOR", "RETURN", "OUTPUT", "INSERTED",
    "DELETED", "TOP", "DISTINCT", "CASE", "WHEN", "EXISTS",
})

# Control flow keywords that start a new statement
_CONTROL_KEYWORDS = re.compile(
    r"^\s*\b(IF|ELSE|WHILE|FOR|LOOP|BEGIN|END|DECLARE|SET|SELECT|INSERT|UPDATE|"
    r"DELETE|MERGE|EXEC|EXECUTE|CALL|RETURN|RAISE|RAISERROR|THROW|PRINT|"
    r"BREAK|CONTINUE|GOTO|WAITFOR|OPEN|CLOSE|FETCH|DEALLOCATE|CURSOR|"
    r"CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|DENY|COMMIT|ROLLBACK|"
    r"SAVE|BEGIN\s+TRY|BEGIN\s+CATCH|END\s+TRY|END\s+CATCH|EXCEPTION)\b",
    re.IGNORECASE,
)


def _clean_table_name(name: str) -> str:
    """Remove brackets and clean table name."""
    return name.replace("[", "").replace("]", "").strip()


def _is_valid_table(name: str) -> bool:
    """Check if extracted name looks like a valid table (not a keyword)."""
    clean = _clean_table_name(name).upper().split(".")[-1]
    return bool(clean) and clean not in _NON_TABLE_KEYWORDS and not clean.startswith("@")


def _extract_tables(text: str) -> list[str]:
    """Extract table names from a SQL statement."""
    tables: list[str] = []
    for pattern in (_TABLE_FROM_PATTERN, _TABLE_INTO_PATTERN, _TABLE_UPDATE_PATTERN,
                    _TABLE_DELETE_PATTERN, _TABLE_MERGE_PATTERN):
        for m in pattern.finditer(text):
            name = _clean_table_name(m.group(1))
            if _is_valid_table(name) and name not in tables:
                tables.append(name)
    return tables


def _extract_variables(text: str) -> list[str]:
    """Extract all @variables from text."""
    return list(dict.fromkeys(m.group() for m in _VAR_PATTERN.finditer(text)))


@dataclass
class _StackFrame:
    """Tracks current nesting context during flow tree parsing."""
    node: FlowNode
    block_type: str  # root, if_true, if_false, while, try, catch, begin
    target_list: str  # children, true_branch, false_branch
    expects_end: bool = False
    is_single_line: bool = False  # for IF without BEGIN


class _FlowTreeParser:
    """Stack-based parser that builds a nested FlowNode tree."""

    def __init__(self, sql: str, dialect: str):
        self._sql = sql
        self._dialect = dialect
        self._lines: list[str] = sql.split("\n")
        self._counter = 0
        self._stack: list[_StackFrame] = []

    def _next_id(self) -> str:
        self._counter += 1
        return f"n{self._counter}"

    def _current_frame(self) -> _StackFrame:
        return self._stack[-1]

    def _append_node(self, node: FlowNode) -> None:
        """Append a node to the current frame's target."""
        frame = self._current_frame()
        parent = frame.node

        if frame.target_list == "children":
            parent.children.append(node)
        elif frame.target_list == "true_branch":
            if parent.true_branch is None:
                parent.true_branch = FlowNode(
                    node_id=f"{parent.node_id}_true",
                    node_type="branch",
                    label="Then",
                )
            parent.true_branch.children.append(node)
        elif frame.target_list == "false_branch":
            if parent.false_branch is None:
                parent.false_branch = FlowNode(
                    node_id=f"{parent.node_id}_false",
                    node_type="branch",
                    label="Else",
                )
            parent.false_branch.children.append(node)

        # Auto-pop single-line IF frames after one statement
        if frame.is_single_line and frame.block_type in ("if_true", "if_false"):
            self._stack.pop()

    def _find_if_node_for_else(self) -> FlowNode | None:
        """Find the IF node that this ELSE belongs to.

        After an IF's BEGIN/END block is closed, the if_true frame is already
        popped. So we search the current scope's children for the most recent
        condition node without a false_branch. If none found, check if the
        current frame itself is an if_true/if_false (edge case).
        """
        # First: check children of current scope for a recently closed IF
        children = self._get_current_target_list()
        if children:
            for child in reversed(children):
                if child.node_type == "condition" and child.false_branch is None:
                    return child

        # Fallback: current frame is if_true/if_false (single-line IF edge case)
        frame = self._current_frame()
        if frame.block_type in ("if_true", "if_false"):
            popped = self._stack.pop()
            return popped.node

        return None

    def _get_current_target_list(self) -> list[FlowNode]:
        """Get the list where nodes are currently being appended."""
        frame = self._current_frame()
        parent = frame.node
        if frame.target_list == "children":
            return parent.children
        elif frame.target_list == "true_branch":
            return parent.true_branch.children if parent.true_branch else []
        elif frame.target_list == "false_branch":
            return parent.false_branch.children if parent.false_branch else []
        return []

    def _accumulate_statement(self, start_idx: int) -> tuple[str, int]:
        """Accumulate multi-line statement starting at start_idx.

        Returns (accumulated_text, last_line_index).
        """
        lines_acc = [self._lines[start_idx].strip()]
        i = start_idx + 1
        while i < len(self._lines):
            line = self._lines[i].strip()
            if not line or line.startswith("--") or line.startswith("/*"):
                i += 1
                continue
            upper = line.upper()
            # Stop if next line starts a new statement/control flow
            if _CONTROL_KEYWORDS.match(line):
                break
            # Stop on standalone closing patterns
            if upper.rstrip(";").strip() in ("END", "END TRY", "END CATCH", ")"):
                break
            lines_acc.append(line)
            i += 1
        return "\n".join(lines_acc), i - 1

    def _classify_and_create(self, line_idx: int) -> int:
        """Classify the line at line_idx, create appropriate node(s), return next index."""
        raw_line = self._lines[line_idx]
        stripped = raw_line.strip()
        upper = stripped.upper()
        line_num = line_idx + 1  # 1-based

        if not stripped or stripped.startswith("--") or stripped.startswith("/*"):
            return line_idx + 1

        # ── BEGIN TRY ──
        if re.match(r"\bBEGIN\s+TRY\b", upper):
            node = FlowNode(
                node_id=self._next_id(),
                node_type="error_handler",
                label="BEGIN TRY",
                line_number=line_num,
                operation="TRY",
                sql_snippet=stripped,
            )
            self._append_node(node)
            self._stack.append(_StackFrame(
                node=node, block_type="try",
                target_list="true_branch", expects_end=True,
            ))
            return line_idx + 1

        # ── BEGIN CATCH ──
        if re.match(r"\bBEGIN\s+CATCH\b", upper):
            # Pop TRY frame if still on stack
            if self._current_frame().block_type == "try":
                self._stack.pop()

            # Find the TRY node — search current scope children
            try_node = None
            children = self._get_current_target_list()
            for child in reversed(children):
                if child.node_type == "error_handler" and child.operation == "TRY":
                    try_node = child
                    break

            if try_node:
                self._stack.append(_StackFrame(
                    node=try_node, block_type="catch",
                    target_list="false_branch", expects_end=True,
                ))
            return line_idx + 1

        # ── END TRY ──
        if re.match(r"\bEND\s+TRY\b", upper):
            if len(self._stack) > 1 and self._current_frame().block_type == "try":
                self._stack.pop()
            return line_idx + 1

        # ── END CATCH ──
        if re.match(r"\bEND\s+CATCH\b", upper):
            if len(self._stack) > 1 and self._current_frame().block_type == "catch":
                self._stack.pop()
            return line_idx + 1

        # ── ELSE IF ──
        if re.match(r"\bELSE\s+IF\b", upper):
            if_node = self._find_if_node_for_else()

            # Extract condition
            cond_match = re.match(r"\bELSE\s+IF\s+(.+?)(?:\s*BEGIN\s*$|\s*$)", stripped, re.IGNORECASE)
            cond_text = cond_match.group(1).strip() if cond_match else stripped
            has_begin = upper.rstrip().endswith("BEGIN")

            node = FlowNode(
                node_id=self._next_id(),
                node_type="condition",
                label=stripped[:120],
                line_number=line_num,
                operation="ELSE IF",
                condition=cond_text,
                expression=cond_text,
                variables_read=_extract_variables(cond_text),
                sql_snippet=stripped,
            )

            # Place in parent IF's false_branch
            if if_node and if_node.node_type == "condition":
                if if_node.false_branch is None:
                    if_node.false_branch = FlowNode(
                        node_id=f"{if_node.node_id}_false",
                        node_type="branch",
                        label="Else",
                    )
                if_node.false_branch.children.append(node)
            else:
                self._append_node(node)

            # Check for BEGIN on next line if not inline
            if not has_begin:
                next_begin = self._peek_next_meaningful(line_idx + 1)
                has_begin = next_begin is not None and self._lines[next_begin].strip().upper() == "BEGIN"
                if has_begin:
                    self._stack.append(_StackFrame(
                        node=node, block_type="if_true",
                        target_list="true_branch", expects_end=True,
                    ))
                    return next_begin + 1

            if has_begin:
                self._stack.append(_StackFrame(
                    node=node, block_type="if_true",
                    target_list="true_branch", expects_end=True,
                ))
            else:
                self._stack.append(_StackFrame(
                    node=node, block_type="if_true",
                    target_list="true_branch",
                    is_single_line=True,
                ))
            return line_idx + 1

        # ── ELSE (standalone) ──
        if re.match(r"\bELSE\b", upper) and not re.match(r"\bELSE\s+IF\b", upper):
            if_node = self._find_if_node_for_else()

            if if_node is None:
                return line_idx + 1

            has_begin = upper.rstrip().endswith("BEGIN")
            if not has_begin:
                next_begin = self._peek_next_meaningful(line_idx + 1)
                has_begin = next_begin is not None and self._lines[next_begin].strip().upper() == "BEGIN"
                if has_begin:
                    self._stack.append(_StackFrame(
                        node=if_node, block_type="if_false",
                        target_list="false_branch", expects_end=True,
                    ))
                    return next_begin + 1

            if has_begin:
                self._stack.append(_StackFrame(
                    node=if_node, block_type="if_false",
                    target_list="false_branch", expects_end=True,
                ))
            else:
                self._stack.append(_StackFrame(
                    node=if_node, block_type="if_false",
                    target_list="false_branch",
                    is_single_line=True,
                ))
            return line_idx + 1

        # ── IF ──
        if re.match(r"\bIF\b", upper) and not re.match(r"\bIF\s+EXISTS\b", upper):
            cond_match = _IF_CONDITION_PATTERN.match(stripped)
            cond_text = cond_match.group(1).strip() if cond_match else stripped
            has_begin = upper.rstrip().endswith("BEGIN")

            node = FlowNode(
                node_id=self._next_id(),
                node_type="condition",
                label=stripped[:120],
                line_number=line_num,
                operation="IF",
                condition=cond_text,
                expression=cond_text,
                variables_read=_extract_variables(cond_text),
                sql_snippet=stripped,
            )
            self._append_node(node)

            if not has_begin:
                next_begin = self._peek_next_meaningful(line_idx + 1)
                has_begin = next_begin is not None and self._lines[next_begin].strip().upper() == "BEGIN"
                if has_begin:
                    self._stack.append(_StackFrame(
                        node=node, block_type="if_true",
                        target_list="true_branch", expects_end=True,
                    ))
                    return next_begin + 1

            if has_begin:
                self._stack.append(_StackFrame(
                    node=node, block_type="if_true",
                    target_list="true_branch", expects_end=True,
                ))
            else:
                self._stack.append(_StackFrame(
                    node=node, block_type="if_true",
                    target_list="true_branch",
                    is_single_line=True,
                ))
            return line_idx + 1

        # ── IF EXISTS (treat as statement, not condition) ──
        if re.match(r"\bIF\s+EXISTS\b", upper):
            full_text, end_idx = self._accumulate_statement(line_idx)
            tables = _extract_tables(full_text)
            all_vars = _extract_variables(full_text)

            node = FlowNode(
                node_id=self._next_id(),
                node_type="condition",
                label=stripped[:120],
                line_number=line_num,
                operation="IF",
                condition=stripped,
                expression=stripped,
                affected_tables=tables,
                variables_read=all_vars,
                sql_snippet=full_text[:500],
            )
            self._append_node(node)

            # Check for BEGIN
            has_begin = upper.rstrip().endswith("BEGIN")
            if not has_begin:
                next_begin = self._peek_next_meaningful(end_idx + 1)
                has_begin = next_begin is not None and self._lines[next_begin].strip().upper() == "BEGIN"
                if has_begin:
                    self._stack.append(_StackFrame(
                        node=node, block_type="if_true",
                        target_list="true_branch", expects_end=True,
                    ))
                    return next_begin + 1

            if has_begin:
                self._stack.append(_StackFrame(
                    node=node, block_type="if_true",
                    target_list="true_branch", expects_end=True,
                ))
            else:
                self._stack.append(_StackFrame(
                    node=node, block_type="if_true",
                    target_list="true_branch",
                    is_single_line=True,
                ))
            return end_idx + 1

        # ── WHILE / FOR ──
        if re.match(r"\b(WHILE|FOR)\b", upper):
            cond_match = _WHILE_CONDITION_PATTERN.match(stripped)
            cond_text = cond_match.group(1).strip() if cond_match else stripped
            op = "WHILE" if upper.startswith("WHILE") else "FOR"

            node = FlowNode(
                node_id=self._next_id(),
                node_type="loop",
                label=stripped[:120],
                line_number=line_num,
                operation=op,
                condition=cond_text,
                expression=cond_text,
                variables_read=_extract_variables(cond_text),
                sql_snippet=stripped,
            )
            self._append_node(node)

            has_begin = upper.rstrip().endswith("BEGIN")
            if not has_begin:
                next_begin = self._peek_next_meaningful(line_idx + 1)
                has_begin = next_begin is not None and self._lines[next_begin].strip().upper() == "BEGIN"
                if has_begin:
                    self._stack.append(_StackFrame(
                        node=node, block_type="while",
                        target_list="children", expects_end=True,
                    ))
                    return next_begin + 1

            self._stack.append(_StackFrame(
                node=node, block_type="while",
                target_list="children", expects_end=has_begin,
                is_single_line=not has_begin,
            ))
            return line_idx + 1

        # ── END ──
        if re.match(r"\bEND\b", upper) and not re.match(r"\bEND\s+(TRY|CATCH)\b", upper):
            if len(self._stack) > 1:
                frame = self._current_frame()
                if frame.expects_end:
                    self._stack.pop()
                elif frame.block_type in ("if_true", "if_false", "while", "begin"):
                    self._stack.pop()
            return line_idx + 1

        # ── BEGIN (standalone, not control flow) ──
        if upper == "BEGIN" or (upper.startswith("BEGIN") and not re.match(r"\bBEGIN\s+(TRY|CATCH|TRAN|TRANSACTION)\b", upper)):
            # Only push if we're not already expecting this BEGIN from a control flow
            if len(self._stack) > 0 and self._current_frame().block_type == "root":
                self._stack.append(_StackFrame(
                    node=self._current_frame().node,
                    block_type="begin",
                    target_list="children",
                    expects_end=True,
                ))
            return line_idx + 1

        # ── DECLARE ──
        if re.match(r"\bDECLARE\b", upper):
            full_text, end_idx = self._accumulate_statement(line_idx)
            vars_written = []
            for m in _DECLARE_PATTERN.finditer(full_text):
                vars_written.append(m.group(1))
            # Also catch comma-separated declarations
            if not vars_written:
                vars_written = _extract_variables(full_text)

            node = FlowNode(
                node_id=self._next_id(),
                node_type="statement",
                label=stripped[:120],
                line_number=line_num,
                operation="DECLARE",
                variables_written=vars_written,
                sql_snippet=full_text[:500],
            )
            self._append_node(node)
            return end_idx + 1

        # ── SET ──
        if re.match(r"\bSET\b", upper):
            full_text, end_idx = self._accumulate_statement(line_idx)
            set_match = _SET_ASSIGN_PATTERN.match(full_text)
            var_written = set_match.group(1) if set_match else None
            expression = set_match.group(2).strip()[:200] if set_match else None
            vars_read = _extract_variables(expression) if expression else []
            # Remove the written var from reads
            if var_written and var_written in vars_read:
                vars_read = [v for v in vars_read if v != var_written]

            node = FlowNode(
                node_id=self._next_id(),
                node_type="statement",
                label=stripped[:120],
                line_number=line_num,
                operation="SET",
                expression=expression,
                variables_written=[var_written] if var_written else [],
                variables_read=vars_read,
                sql_snippet=full_text[:500],
            )
            self._append_node(node)
            return end_idx + 1

        # ── SELECT (assignment or INTO variable) ──
        if re.match(r"\bSELECT\b", upper) and (
            _SELECT_ASSIGN_PATTERN.search(stripped) or
            _SELECT_INTO_VAR_PATTERN.search(stripped)
        ):
            full_text, end_idx = self._accumulate_statement(line_idx)
            tables = _extract_tables(full_text)
            all_vars = _extract_variables(full_text)

            # Variables being assigned to (SELECT @var = ...)
            vars_written = [m.group(1) for m in _SELECT_ASSIGN_PATTERN.finditer(full_text)]
            # SELECT ... INTO @var
            for m in _SELECT_INTO_VAR_PATTERN.finditer(full_text):
                if m.group(2) not in vars_written:
                    vars_written.append(m.group(2))

            vars_read = [v for v in all_vars if v not in vars_written]

            node = FlowNode(
                node_id=self._next_id(),
                node_type="statement",
                label=stripped[:120],
                line_number=line_num,
                operation="SELECT",
                affected_tables=tables,
                variables_written=vars_written,
                variables_read=vars_read,
                sql_snippet=full_text[:500],
            )
            self._append_node(node)
            return end_idx + 1

        # ── EXEC / EXECUTE / CALL ──
        if re.match(r"\b(EXEC|EXECUTE|CALL)\b", upper):
            full_text, end_idx = self._accumulate_statement(line_idx)
            proc_match = _EXEC_PROC_PATTERN.match(full_text)
            target_proc = _clean_table_name(proc_match.group(1)) if proc_match else None
            vars_read = _extract_variables(full_text)

            node = FlowNode(
                node_id=self._next_id(),
                node_type="call",
                label=stripped[:120],
                line_number=line_num,
                operation="EXEC",
                target_procedure=target_proc,
                variables_read=vars_read,
                sql_snippet=full_text[:500],
            )
            self._append_node(node)
            return end_idx + 1

        # ── INSERT ──
        if re.match(r"\bINSERT\b", upper):
            full_text, end_idx = self._accumulate_statement(line_idx)
            tables = _extract_tables(full_text)
            all_vars = _extract_variables(full_text)

            node = FlowNode(
                node_id=self._next_id(),
                node_type="statement",
                label=stripped[:120],
                line_number=line_num,
                operation="INSERT",
                affected_tables=tables,
                variables_read=all_vars,
                sql_snippet=full_text[:500],
            )
            self._append_node(node)
            return end_idx + 1

        # ── UPDATE ──
        if re.match(r"\bUPDATE\b", upper):
            full_text, end_idx = self._accumulate_statement(line_idx)
            tables = _extract_tables(full_text)
            all_vars = _extract_variables(full_text)

            node = FlowNode(
                node_id=self._next_id(),
                node_type="statement",
                label=stripped[:120],
                line_number=line_num,
                operation="UPDATE",
                affected_tables=tables,
                variables_read=all_vars,
                sql_snippet=full_text[:500],
            )
            self._append_node(node)
            return end_idx + 1

        # ── DELETE ──
        if re.match(r"\bDELETE\b", upper):
            full_text, end_idx = self._accumulate_statement(line_idx)
            tables = _extract_tables(full_text)
            all_vars = _extract_variables(full_text)

            node = FlowNode(
                node_id=self._next_id(),
                node_type="statement",
                label=stripped[:120],
                line_number=line_num,
                operation="DELETE",
                affected_tables=tables,
                variables_read=all_vars,
                sql_snippet=full_text[:500],
            )
            self._append_node(node)
            return end_idx + 1

        # ── MERGE ──
        if re.match(r"\bMERGE\b", upper):
            full_text, end_idx = self._accumulate_statement(line_idx)
            tables = _extract_tables(full_text)
            all_vars = _extract_variables(full_text)

            node = FlowNode(
                node_id=self._next_id(),
                node_type="statement",
                label=stripped[:120],
                line_number=line_num,
                operation="MERGE",
                affected_tables=tables,
                variables_read=all_vars,
                sql_snippet=full_text[:500],
            )
            self._append_node(node)
            return end_idx + 1

        # ── SELECT INTO (table, not variable) ──
        if re.match(r"\bSELECT\s+.*\bINTO\b", upper) or re.match(r"\bSELECT\b", upper):
            full_text, end_idx = self._accumulate_statement(line_idx)
            tables = _extract_tables(full_text)
            all_vars = _extract_variables(full_text)

            node = FlowNode(
                node_id=self._next_id(),
                node_type="statement",
                label=stripped[:120],
                line_number=line_num,
                operation="SELECT",
                affected_tables=tables,
                variables_read=all_vars,
                sql_snippet=full_text[:500],
            )
            self._append_node(node)
            return end_idx + 1

        # ── RETURN ──
        if re.match(r"\bRETURN\b", upper):
            vars_read = _extract_variables(stripped)
            node = FlowNode(
                node_id=self._next_id(),
                node_type="return",
                label=stripped[:120],
                line_number=line_num,
                operation="RETURN",
                variables_read=vars_read,
                sql_snippet=stripped,
            )
            self._append_node(node)
            return line_idx + 1

        # ── RAISERROR / THROW ──
        if re.match(r"\b(RAISERROR|THROW)\b", upper):
            full_text, end_idx = self._accumulate_statement(line_idx)
            vars_read = _extract_variables(full_text)
            node = FlowNode(
                node_id=self._next_id(),
                node_type="error_handler",
                label=stripped[:120],
                line_number=line_num,
                operation="RAISERROR" if "RAISERROR" in upper else "THROW",
                variables_read=vars_read,
                sql_snippet=full_text[:500],
            )
            self._append_node(node)
            return end_idx + 1

        # ── PRINT ──
        if re.match(r"\bPRINT\b", upper):
            vars_read = _extract_variables(stripped)
            node = FlowNode(
                node_id=self._next_id(),
                node_type="statement",
                label=stripped[:120],
                line_number=line_num,
                operation="PRINT",
                variables_read=vars_read,
                sql_snippet=stripped,
            )
            self._append_node(node)
            return line_idx + 1

        # ── BEGIN TRANSACTION / COMMIT / ROLLBACK ──
        if re.match(r"\b(BEGIN\s+TRAN(?:SACTION)?|COMMIT|ROLLBACK|SAVE\s+TRAN)\b", upper):
            op = "COMMIT" if "COMMIT" in upper else "ROLLBACK" if "ROLLBACK" in upper else "BEGIN TRANSACTION"
            node = FlowNode(
                node_id=self._next_id(),
                node_type="statement",
                label=stripped[:120],
                line_number=line_num,
                operation=op,
                sql_snippet=stripped,
            )
            self._append_node(node)
            return line_idx + 1

        # ── CURSOR operations ──
        if re.match(r"\b(OPEN|CLOSE|FETCH|DEALLOCATE)\b", upper):
            full_text, end_idx = self._accumulate_statement(line_idx)
            vars_read = _extract_variables(full_text)
            op = upper.split()[0]
            node = FlowNode(
                node_id=self._next_id(),
                node_type="statement",
                label=stripped[:120],
                line_number=line_num,
                operation=op,
                variables_read=vars_read,
                sql_snippet=full_text[:500],
            )
            self._append_node(node)
            return end_idx + 1

        # ── TRUNCATE ──
        if re.match(r"\bTRUNCATE\b", upper):
            tables = _extract_tables(stripped)
            node = FlowNode(
                node_id=self._next_id(),
                node_type="statement",
                label=stripped[:120],
                line_number=line_num,
                operation="TRUNCATE",
                affected_tables=tables,
                sql_snippet=stripped,
            )
            self._append_node(node)
            return line_idx + 1

        # ── Unrecognized line — skip ──
        return line_idx + 1

    def _peek_next_meaningful(self, start: int) -> int | None:
        """Find the index of the next non-blank, non-comment line."""
        i = start
        while i < len(self._lines):
            line = self._lines[i].strip()
            if line and not line.startswith("--") and not line.startswith("/*"):
                return i
            i += 1
        return None

    def parse(self) -> FlowNode:
        root = FlowNode(
            node_id="start", node_type="start", label="Start", line_number=1,
        )
        self._stack = [_StackFrame(
            node=root, block_type="root", target_list="children",
        )]

        i = 0
        while i < len(self._lines):
            i = self._classify_and_create(i)

        # Close unclosed frames
        while len(self._stack) > 1:
            self._stack.pop()

        root.children.append(FlowNode(
            node_id="end", node_type="end", label="End",
            line_number=len(self._lines),
        ))
        return root


class HybridFlowBuilder(IFlowBuilder):
    def build_flow_tree(self, sql: str, dialect: str) -> FlowNode:
        try:
            parser = _FlowTreeParser(sql, dialect)
            return parser.parse()
        except Exception as e:
            logger.warning(f"Enhanced flow builder failed, using fallback: {e}")
            return self._build_flat_fallback(sql)

    def _build_flat_fallback(self, sql: str) -> FlowNode:
        """Original flat algorithm as fallback."""
        root = FlowNode(node_id="start", node_type="start", label="Start", line_number=1)
        counter = 0
        lines = sql.split("\n")
        for i, line in enumerate(lines, 1):
            stripped = line.strip().upper()
            if not stripped or stripped.startswith(("--", "/*")):
                continue
            node_type = self._classify_line(stripped)
            if node_type:
                counter += 1
                root.children.append(FlowNode(
                    node_id=f"n{counter}",
                    node_type=node_type,
                    label=line.strip()[:80],
                    line_number=i,
                ))
        root.children.append(FlowNode(
            node_id="end", node_type="end", label="End", line_number=len(lines),
        ))
        return root

    def calculate_complexity(self, sql: str, dialect: str) -> ComplexityMetrics:
        line_count = sql.count("\n") + 1

        ast_branches = 0
        try:
            parsed = sqlglot.parse(sql, read=dialect, error_level=sqlglot.ErrorLevel.IGNORE)
            for stmt in parsed:
                if stmt is None:
                    continue
                for node in stmt.walk():
                    if isinstance(node, exp.If | exp.Case | exp.And | exp.Or):
                        ast_branches += 1
        except Exception as e:
            logger.warning(f"AST-based complexity analysis failed: {e}")

        branch_keywords = re.findall(
            r"\b(IF|ELSE\s*IF|ELSIF|WHEN|WHILE|LOOP|FOR|CURSOR|EXCEPTION|CATCH)\b",
            sql, re.IGNORECASE,
        )
        branch_count = max(ast_branches, len(branch_keywords))
        cc = max(ast_branches + 1, len(branch_keywords) + 1)

        loop_keywords = re.findall(r"\b(WHILE|LOOP|FOR|CURSOR)\b", sql, re.IGNORECASE)

        nesting = 0
        max_nesting = 0
        for kw in re.findall(r"\b(BEGIN|IF|WHILE|LOOP|FOR|CASE|END)\b", sql, re.IGNORECASE):
            if kw.upper() != "END":
                nesting += 1
                max_nesting = max(max_nesting, nesting)
            else:
                nesting = max(0, nesting - 1)

        return ComplexityMetrics(
            cyclomatic_complexity=cc,
            nesting_depth=max_nesting,
            branch_count=branch_count,
            loop_count=len(loop_keywords),
            line_count=line_count,
        )

    @staticmethod
    def _classify_line(stripped: str) -> str | None:
        if re.match(r"\bIF\b", stripped):
            return "condition"
        if re.match(r"\b(WHILE|LOOP|FOR)\b", stripped):
            return "loop"
        if re.match(r"\b(EXEC|EXECUTE|CALL)\b", stripped):
            return "call"
        if re.match(r"\b(INSERT|UPDATE|DELETE|MERGE|SELECT\s+INTO)\b", stripped):
            return "statement"
        if re.match(r"\b(RETURN|RAISE|RAISERROR|THROW)\b", stripped):
            return "return" if "RETURN" in stripped else "error_handler"
        if re.match(r"\b(BEGIN\s+TRY|BEGIN\s+CATCH|EXCEPTION)\b", stripped):
            return "error_handler"
        return None
