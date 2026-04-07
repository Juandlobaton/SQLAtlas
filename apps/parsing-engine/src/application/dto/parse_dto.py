"""Application DTOs: Input/Output boundaries for use cases.

These are the ONLY types that cross the application boundary.
External layers (presentation) create Inputs and receive Outputs.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class ParseInput:
    sql: str
    dialect: str
    extract_dependencies: bool = True
    analyze_flow: bool = True
    analyze_complexity: bool = True
    analyze_security: bool = True
    generate_docs: bool = True


@dataclass(frozen=True)
class ParseOutput:
    success: bool
    results: list[dict[str, Any]]
    errors: list[str] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class BatchParseInput:
    items: list[ParseInput]
    correlation_id: str | None = None


@dataclass(frozen=True)
class BatchParseOutput:
    success: bool
    results: list[ParseOutput]
    total_processed: int = 0
    total_errors: int = 0


@dataclass(frozen=True)
class AnalyzeInput:
    sql: str
    dialect: str
    analysis_types: list[str] = field(
        default_factory=lambda: ["dependencies", "security", "complexity", "flow"]
    )


@dataclass(frozen=True)
class AnalyzeOutput:
    success: bool
    dependencies: list[dict[str, Any]] = field(default_factory=list)
    table_references: list[dict[str, Any]] = field(default_factory=list)
    security_findings: list[dict[str, Any]] = field(default_factory=list)
    complexity: dict[str, Any] | None = None
    flow_tree: dict[str, Any] | None = None
    errors: list[str] = field(default_factory=list)
