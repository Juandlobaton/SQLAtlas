"""Infrastructure: T-SQL (SQL Server) flow tree engine.

Handles T-SQL-specific constructs: BEGIN TRY/CATCH, @variables,
RAISERROR/THROW, PRINT, BREAK/CONTINUE.
"""

from __future__ import annotations

import re
from typing import TYPE_CHECKING

from src.domain.entities.flow_node import FlowNode
from src.infrastructure.analyzers.flow_builder_base import (
    FlowBuilderBase,
    StackFrame,
    extract_variables_tsql,
)

if TYPE_CHECKING:
    from collections.abc import Callable


class TsqlFlowEngine(FlowBuilderBase):
    """T-SQL (SQL Server) flow tree engine."""

    @property
    def dialect_name(self) -> str:
        return "tsql"

    def _vars(self, text: str) -> list[str]:
        return extract_variables_tsql(text)

    def _get_handler_chain(self) -> list[Callable]:
        return [
            # T-SQL specific (must be before generic END/BEGIN)
            self._handle_begin_try,
            self._handle_begin_catch,
            self._handle_end_try,
            self._handle_end_catch,
            # Shared control flow
            self._handle_elsif_or_elseif,
            self._handle_else,
            self._handle_if_exists,
            self._handle_if,
            self._handle_while_for,
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
            self._handle_raiserror_throw,
            self._handle_print,
            self._handle_transaction,
            self._handle_break_continue,
            self._handle_cursor_ops,
            self._handle_truncate,
        ]

    # ── T-SQL specific handlers ──

    def _handle_begin_try(self, line_idx: int, stripped: str,

            upper: str, line_num: int) -> int | None:
        if not re.match(r"\bBEGIN\s+TRY\b", upper):
            return None
        node = FlowNode(
            node_id=self._next_id(), node_type="error_handler",
            label="BEGIN TRY", line_number=line_num,
            operation="TRY", sql_snippet=stripped,
        )
        self._append_node(node)
        self._stack.append(StackFrame(
            node=node, block_type="try",
            target_list="true_branch", expects_end=True,
        ))
        return line_idx + 1

    def _handle_begin_catch(self, line_idx: int, _stripped: str,

            upper: str, _line_num: int) -> int | None:
        if not re.match(r"\bBEGIN\s+CATCH\b", upper):
            return None
        if self._current_frame().block_type == "try":
            self._stack.pop()

        try_node = None
        children = self._get_current_target_list()
        for child in reversed(children):
            if child.node_type == "error_handler" and child.operation == "TRY":
                try_node = child
                break

        if try_node:
            self._stack.append(StackFrame(
                node=try_node, block_type="catch",
                target_list="false_branch", expects_end=True,
            ))
        return line_idx + 1

    def _handle_end_try(self, line_idx: int, _stripped: str,

            upper: str, _line_num: int) -> int | None:
        if not re.match(r"\bEND\s+TRY\b", upper):
            return None
        if len(self._stack) > 1 and self._current_frame().block_type == "try":
            self._stack.pop()
        return line_idx + 1

    def _handle_end_catch(self, line_idx: int, _stripped: str,

            upper: str, _line_num: int) -> int | None:
        if not re.match(r"\bEND\s+CATCH\b", upper):
            return None
        if len(self._stack) > 1 and self._current_frame().block_type == "catch":
            self._stack.pop()
        return line_idx + 1

    def _handle_raiserror_throw(self, line_idx: int, stripped: str,

            upper: str, line_num: int) -> int | None:
        if not re.match(r"\b(RAISERROR|THROW)\b", upper):
            return None
        full_text, end_idx = self._accumulate_statement(line_idx)
        vars_read = self._vars(full_text)
        op = "RAISERROR" if "RAISERROR" in upper else "THROW"
        node = FlowNode(
            node_id=self._next_id(), node_type="error_handler",
            label=stripped[:120], line_number=line_num,
            operation=op, variables_read=vars_read,
            sql_snippet=full_text[:500],
        )
        self._append_node(node)
        return end_idx + 1

    def _handle_print(self, line_idx: int, stripped: str,

            upper: str, line_num: int) -> int | None:
        if not re.match(r"\bPRINT\b", upper):
            return None
        vars_read = self._vars(stripped)
        node = FlowNode(
            node_id=self._next_id(), node_type="statement",
            label=stripped[:120], line_number=line_num,
            operation="PRINT", variables_read=vars_read, sql_snippet=stripped,
        )
        self._append_node(node)
        return line_idx + 1

    def _handle_break_continue(self, line_idx: int, stripped: str,

            upper: str, line_num: int) -> int | None:
        if not re.match(r"\b(BREAK|CONTINUE)\b", upper):
            return None
        op = "BREAK" if "BREAK" in upper else "CONTINUE"
        node = FlowNode(
            node_id=self._next_id(), node_type="statement",
            label=op, line_number=line_num,
            operation=op, sql_snippet=stripped,
        )
        self._append_node(node)
        return line_idx + 1
