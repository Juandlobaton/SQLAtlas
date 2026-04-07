"""Pure domain entity: Reference to a variable in SQL code."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class VariableReference:
    """Tracks a single usage of a variable in SQL source code."""

    variable_name: str
    reference_type: str  # declare, set, parameter_in, parameter_out,
    # where_clause, insert_value, update_set,
    # exec_argument, condition, select_into, return
    line_number: int | None = None
    data_type: str | None = None
    scope: str | None = None
    target_variable: str | None = None
    target_procedure: str | None = None
    expression: str | None = None

    def is_declaration(self) -> bool:
        return self.reference_type in ("declare", "parameter_in", "parameter_out")

    def is_write(self) -> bool:
        return self.reference_type in ("declare", "set", "select_into", "parameter_out")

    def is_read(self) -> bool:
        return self.reference_type in (
            "where_clause", "insert_value", "update_set",
            "exec_argument", "condition", "return",
        )

    def to_dict(self) -> dict[str, object]:
        return {
            "variableName": self.variable_name,
            "referenceType": self.reference_type,
            "lineNumber": self.line_number,
            "dataType": self.data_type,
            "scope": self.scope,
            "targetVariable": self.target_variable,
            "targetProcedure": self.target_procedure,
            "expression": self.expression,
        }
