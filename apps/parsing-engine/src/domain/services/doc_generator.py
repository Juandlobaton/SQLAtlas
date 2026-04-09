"""Domain port: Auto-documentation generation contract."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from src.domain.entities.complexity import ComplexityMetrics
    from src.domain.entities.dependency import DependencyRef
    from src.domain.entities.flow_node import FlowNode
    from src.domain.entities.parameter import ParameterInfo
    from src.domain.entities.table_reference import TableRef


class IDocGenerator(ABC):
    """Contract for generating automatic documentation."""

    @abstractmethod
    def generate(
        self,
        name: str,
        parameters: list[ParameterInfo],
        table_refs: list[TableRef],
        dependencies: list[DependencyRef],
        complexity: ComplexityMetrics | None,
        return_type: str | None,
    ) -> dict[str, Any]:
        """Generate documentation for a database object."""

    def generate_enhanced(
        self,
        name: str,
        parameters: list[ParameterInfo],
        table_refs: list[TableRef],
        dependencies: list[DependencyRef],
        complexity: ComplexityMetrics | None,
        return_type: str | None,
        raw_sql: str | None = None,
        flow_tree: FlowNode | None = None,
    ) -> dict[str, Any]:
        """Generate enhanced documentation with comments, flow steps, and process overview."""
        return self.generate(name, parameters, table_refs, dependencies, complexity, return_type)
