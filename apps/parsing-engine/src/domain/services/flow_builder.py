"""Domain port: Execution flow analysis contract."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from src.domain.entities.complexity import ComplexityMetrics
    from src.domain.entities.flow_node import FlowNode


class IFlowBuilder(ABC):
    """Contract for building execution flow trees from SQL."""

    @abstractmethod
    def build_flow_tree(self, sql: str, dialect: str) -> FlowNode:
        """Build execution flow tree from SQL source."""

    @abstractmethod
    def calculate_complexity(self, sql: str, dialect: str) -> ComplexityMetrics:
        """Calculate cyclomatic complexity and related metrics."""
