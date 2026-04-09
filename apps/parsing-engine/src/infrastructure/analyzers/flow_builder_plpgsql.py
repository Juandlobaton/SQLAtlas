"""Infrastructure: PostgreSQL PL/pgSQL flow tree engine.

Extends ANSI engine. Currently identical to ANSI base; ready for
PG-specific constructs (PERFORM semantics, RAISE NOTICE formatting,
RETURN QUERY/NEXT, GET DIAGNOSTICS) as needed.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from src.infrastructure.analyzers.flow_builder_ansi import AnsiFlowEngine

if TYPE_CHECKING:
    from collections.abc import Callable


class PlpgsqlFlowEngine(AnsiFlowEngine):
    """PostgreSQL PL/pgSQL flow tree engine."""

    @property
    def dialect_name(self) -> str:
        return "plpgsql"

    def _get_handler_chain(self) -> list[Callable]:
        return self._ansi_handler_chain()
