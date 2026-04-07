"""Domain port: Security scanning contract."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from src.domain.entities.security_finding import SecurityFinding


class ISecurityScanner(ABC):
    """Contract for scanning SQL code for security vulnerabilities."""

    @abstractmethod
    def scan(self, sql: str, dialect: str) -> list[SecurityFinding]:
        """Scan SQL source for security issues."""

    @abstractmethod
    def get_rules(self, dialect: str) -> list[dict[str, Any]]:
        """Get the list of security rules for a dialect."""
