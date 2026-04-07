"""Pure domain entity: Dependency reference between database objects."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class DependencyRef:
    target_name: str
    dependency_type: str  # calls, reads_from, writes_to, references
    line_number: int | None = None
    column: int | None = None
    statement_type: str | None = None
    is_dynamic: bool = False
    confidence: float = 1.0
    conditional_path: str | None = None
    snippet: str | None = None

    def is_reliable(self) -> bool:
        return self.confidence >= 0.8 and not self.is_dynamic

    def is_call(self) -> bool:
        return self.dependency_type == "calls"
