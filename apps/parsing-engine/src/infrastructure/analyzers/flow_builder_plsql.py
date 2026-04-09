"""Infrastructure: Oracle PL/SQL flow tree engine.

Extends ANSI engine with Oracle-specific constructs: FORALL bulk DML.
"""

from __future__ import annotations

import re
from collections.abc import Callable

from src.domain.entities.flow_node import FlowNode
from src.infrastructure.analyzers.flow_builder_ansi import AnsiFlowEngine
from src.infrastructure.analyzers.flow_builder_base import _extract_tables


class PlsqlFlowEngine(AnsiFlowEngine):
    """Oracle PL/SQL flow tree engine."""

    @property
    def dialect_name(self) -> str:
        return "plsql"

    def _get_handler_chain(self) -> list[Callable]:
        chain = self._ansi_handler_chain()
        # Insert FORALL before DML handlers (before _handle_select_assignment)
        idx = next(
            (i for i, h in enumerate(chain) if h == self._handle_select_assignment),
            len(chain),
        )
        chain.insert(idx, self._handle_forall)
        return chain

    # ── Oracle-specific handlers ──

    def _handle_forall(self, line_idx: int, stripped: str, upper: str, line_num: int) -> int | None:
        if not re.match(r"\bFORALL\b", upper):
            return None
        full_text, end_idx = self._accumulate_statement(line_idx)
        tables = _extract_tables(full_text)
        node = FlowNode(
            node_id=self._next_id(), node_type="loop",
            label=stripped[:120], line_number=line_num,
            operation="FORALL", affected_tables=tables,
            sql_snippet=full_text[:500],
        )
        self._append_node(node)
        return end_idx + 1
