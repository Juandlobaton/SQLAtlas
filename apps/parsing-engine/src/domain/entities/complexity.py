"""Pure domain entity: Complexity metrics for a database object."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class ComplexityMetrics:
    cyclomatic_complexity: int = 1
    nesting_depth: int = 0
    branch_count: int = 0
    loop_count: int = 0
    line_count: int = 0

    @property
    def risk_level(self) -> str:
        if self.cyclomatic_complexity <= 5:
            return "low"
        if self.cyclomatic_complexity <= 10:
            return "moderate"
        if self.cyclomatic_complexity <= 20:
            return "high"
        return "critical"

    def to_dict(self) -> dict[str, Any]:
        return {
            "cyclomaticComplexity": self.cyclomatic_complexity,
            "nestingDepth": self.nesting_depth,
            "branchCount": self.branch_count,
            "loopCount": self.loop_count,
            "lineCount": self.line_count,
            "riskLevel": self.risk_level,
        }
