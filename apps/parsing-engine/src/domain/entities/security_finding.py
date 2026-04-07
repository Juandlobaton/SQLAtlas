"""Pure domain entity: Security finding detected in SQL code."""

from __future__ import annotations

from dataclasses import dataclass

from src.domain.value_objects.severity import Severity


@dataclass(frozen=True)
class SecurityFinding:
    severity: Severity
    finding_type: str
    message: str
    line: int | None = None
    column: int | None = None
    recommendation: str | None = None

    def is_critical(self) -> bool:
        return self.severity in (Severity.CRITICAL, Severity.HIGH)
