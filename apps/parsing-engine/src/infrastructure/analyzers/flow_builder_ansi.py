"""Infrastructure: ANSI SQL/PSM flow tree engine (shared Oracle + PostgreSQL).

Handles constructs common to Oracle PL/SQL and PostgreSQL PL/pgSQL:
IF...THEN...END IF, LOOP...END LOOP, EXCEPTION/WHEN, ELSIF, EXIT WHEN, RAISE.
"""

from __future__ import annotations

import re
from collections.abc import Callable

from src.domain.entities.flow_node import FlowNode
from src.infrastructure.analyzers.flow_builder_base import (
    FlowBuilderBase,
    StackFrame,
    _extract_tables,
    extract_variables_plsql,
)


class AnsiFlowEngine(FlowBuilderBase):
    """Base for ANSI SQL/PSM-style dialects (Oracle PL/SQL, PostgreSQL PL/pgSQL)."""

    def _vars(self, text: str) -> list[str]:
        return extract_variables_plsql(text)

    def _get_handler_chain(self) -> list[Callable]:
        return self._ansi_handler_chain()

    def _ansi_handler_chain(self) -> list[Callable]:
        """Core handler chain shared by Oracle and PG engines."""
        return [
            # ANSI-specific (must be before generic END/BEGIN)
            self._handle_exception,
            self._handle_when_in_exception,
            # Shared control flow
            self._handle_elsif_or_elseif,
            self._handle_else,
            self._handle_if_exists,
            self._handle_if,
            # ANSI-specific loop constructs
            self._handle_loop_standalone,
            self._handle_end_loop,
            self._handle_while_for,
            self._handle_end_if,
            self._handle_end_generic,
            self._handle_begin_standalone,
            # Declarations
            self._handle_declare_cursor,
            self._handle_declare,
            self._handle_set,
            # DML
            self._handle_select_assignment,
            self._handle_exec_call,
            self._handle_insert,
            self._handle_update,
            self._handle_delete,
            self._handle_merge,
            self._handle_select,
            # Control
            self._handle_return,
            self._handle_raise,
            self._handle_transaction,
            self._handle_exit_when,
            self._handle_cursor_ops,
            self._handle_truncate,
        ]

    # ── ANSI-specific handlers ──

    def _handle_exception(self, line_idx: int, stripped: str, upper: str, line_num: int) -> int | None:
        if not re.match(r"\bEXCEPTION\b", upper):
            return None
        if re.match(r"\bEXCEPTION_INIT\b", upper):
            return None

        node = FlowNode(
            node_id=self._next_id(), node_type="error_handler",
            label="EXCEPTION", line_number=line_num,
            operation="EXCEPTION", sql_snippet=stripped,
        )
        self._append_node(node)
        self._stack.append(StackFrame(
            node=node, block_type="exception",
            target_list="false_branch", expects_end=True,
        ))
        return line_idx + 1

    def _handle_when_in_exception(self, line_idx: int, stripped: str, upper: str, line_num: int) -> int | None:
        if not re.match(r"\bWHEN\b", upper) or len(self._stack) <= 1:
            return None

        in_exception = any(
            f.block_type in ("exception", "when_handler")
            for f in self._stack
        )
        if not in_exception:
            return None

        if self._current_frame().block_type == "when_handler":
            self._stack.pop()

        when_match = re.match(r"\bWHEN\s+(.+?)\s+THEN", stripped, re.IGNORECASE)
        when_text = when_match.group(1).strip() if when_match else stripped

        node = FlowNode(
            node_id=self._next_id(), node_type="condition",
            label=stripped[:120], line_number=line_num,
            operation="WHEN", condition=when_text, expression=when_text,
            variables_read=self._vars(when_text), sql_snippet=stripped,
        )
        self._append_node(node)

        self._stack.append(StackFrame(
            node=node, block_type="when_handler",
            target_list="true_branch", expects_end=False,
        ))
        return line_idx + 1

    def _handle_end_if(self, line_idx: int, stripped: str, upper: str, line_num: int) -> int | None:
        if not re.match(r"\bEND\s+IF\b", upper):
            return None
        self._pop_frames_until(("if_true", "if_false"))
        return line_idx + 1

    def _handle_end_loop(self, line_idx: int, stripped: str, upper: str, line_num: int) -> int | None:
        if not re.match(r"\bEND\s+LOOP\b", upper):
            return None
        if len(self._stack) > 1 and self._current_frame().block_type == "while":
            self._stack.pop()
        return line_idx + 1

    def _handle_loop_standalone(self, line_idx: int, stripped: str, upper: str, line_num: int) -> int | None:
        if not (re.match(r"\bLOOP\s*$", upper) or upper == "LOOP"):
            return None
        node = FlowNode(
            node_id=self._next_id(), node_type="loop",
            label="LOOP", line_number=line_num,
            operation="LOOP", sql_snippet=stripped,
        )
        self._append_node(node)
        self._stack.append(StackFrame(
            node=node, block_type="while",
            target_list="children", expects_end=True,
        ))
        return line_idx + 1

    def _handle_exit_when(self, line_idx: int, stripped: str, upper: str, line_num: int) -> int | None:
        if not re.match(r"\bEXIT\b", upper):
            return None
        condition = None
        exit_m = re.match(r"\bEXIT\s+WHEN\s+(.+?)(?:\s*;)?\s*$", stripped, re.IGNORECASE)
        if exit_m:
            condition = exit_m.group(1).strip()
        node = FlowNode(
            node_id=self._next_id(), node_type="statement",
            label=stripped[:120], line_number=line_num,
            operation="EXIT", condition=condition, sql_snippet=stripped,
        )
        self._append_node(node)
        return line_idx + 1

    def _handle_raise(self, line_idx: int, stripped: str, upper: str, line_num: int) -> int | None:
        if not re.match(r"\bRAISE\b", upper):
            return None
        if re.match(r"\bRAISERROR\b", upper):
            return None

        full_text, end_idx = self._accumulate_statement(line_idx)
        vars_read = self._vars(full_text)

        is_reraise = stripped.rstrip(";").strip().upper() == "RAISE"
        node = FlowNode(
            node_id=self._next_id(),
            node_type="statement" if is_reraise else "error_handler",
            label=stripped[:120], line_number=line_num,
            operation="RAISE", variables_read=vars_read,
            sql_snippet=full_text[:500],
        )
        self._append_node(node)
        return end_idx + 1
