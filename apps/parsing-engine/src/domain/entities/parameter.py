"""Pure domain entity: Stored procedure/function parameter."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ParameterInfo:
    name: str
    data_type: str
    mode: str = "IN"  # IN, OUT, INOUT
    default_value: str | None = None
    ordinal_position: int = 0

    def is_output(self) -> bool:
        return self.mode in ("OUT", "INOUT")

    def has_default(self) -> bool:
        return self.default_value is not None
