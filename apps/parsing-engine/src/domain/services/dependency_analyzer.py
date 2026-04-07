"""Domain port: Dependency analysis contract."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from src.domain.entities.dependency import DependencyRef
    from src.domain.entities.table_reference import TableRef


class IDependencyAnalyzer(ABC):
    """Contract for extracting dependencies from SQL source."""

    @abstractmethod
    def extract_call_dependencies(self, sql: str, dialect: str) -> list[DependencyRef]:
        """Extract procedure/function call dependencies."""

    @abstractmethod
    def extract_table_references(self, sql: str, dialect: str) -> list[TableRef]:
        """Extract table read/write references."""

    @abstractmethod
    def extract_dynamic_sql(self, sql: str, dialect: str) -> list[DependencyRef]:
        """Extract dynamic SQL patterns that may hide dependencies."""
