"""Pure domain entity: Table reference within a stored procedure."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class TableRef:
    table_name: str
    full_name: str
    operation: str  # SELECT, INSERT, UPDATE, DELETE, MERGE, TRUNCATE
    schema_name: str | None = None
    line_number: int | None = None
    is_temp_table: bool = False
    columns: tuple[str, ...] = ()

    def is_write_operation(self) -> bool:
        return self.operation in ("INSERT", "UPDATE", "DELETE", "MERGE", "TRUNCATE")

    def is_read_operation(self) -> bool:
        return self.operation == "SELECT"
