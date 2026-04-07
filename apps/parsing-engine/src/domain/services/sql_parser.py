"""Domain port: SQL Parser contract.

This is a pure interface. Infrastructure implements it using SQLGlot or any other parser.
The domain NEVER knows about SQLGlot.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from src.domain.entities.parse_result import ParseResult


class ISqlParser(ABC):
    """Contract for parsing SQL source code into domain entities."""

    @property
    @abstractmethod
    def dialect(self) -> str:
        """The SQL dialect this parser handles (tsql, plpgsql, plsql)."""

    @abstractmethod
    def parse(self, sql: str) -> list[ParseResult]:
        """Parse SQL source and return all extracted objects."""

    @abstractmethod
    def supports_dialect(self, dialect: str) -> bool:
        """Check if this parser supports the given dialect."""
