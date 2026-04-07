"""Value Object: Immutable SHA-256 hash of SQL source code."""

from __future__ import annotations

import hashlib


class SqlHash:
    __slots__ = ("_value",)

    def __init__(self, value: str) -> None:
        if len(value) != 64:
            raise ValueError(f"SqlHash must be 64 hex characters, got {len(value)}")
        self._value = value

    @classmethod
    def from_sql(cls, sql: str) -> SqlHash:
        digest = hashlib.sha256(sql.encode("utf-8")).hexdigest()
        return cls(digest)

    @property
    def value(self) -> str:
        return self._value

    def __str__(self) -> str:
        return self._value

    def __repr__(self) -> str:
        return f"SqlHash({self._value[:12]}...)"

    def __eq__(self, other: object) -> bool:
        if isinstance(other, SqlHash):
            return self._value == other._value
        return NotImplemented

    def __hash__(self) -> int:
        return hash(self._value)
