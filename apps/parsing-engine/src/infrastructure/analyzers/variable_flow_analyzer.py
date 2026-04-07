"""Infrastructure: Variable flow analyzer using regex + AST hybrid approach.

Extracts variable declarations, assignments, and usages from SQL source code.
Follows the same pattern as SqlGlotDependencyAnalyzer.
"""

from __future__ import annotations

import re

from src.domain.entities.variable_reference import VariableReference

# ── Patterns ──

_DECLARE_PATTERN = re.compile(
    r"\bDECLARE\s+(@\w+)\s+([\w]+(?:\([^)]*\))?)",
    re.IGNORECASE,
)

_SET_PATTERN = re.compile(
    r"\bSET\s+(@\w+)\s*=\s*(.+?)(?:;|\n|$)",
    re.IGNORECASE,
)

_SELECT_INTO_PATTERN = re.compile(
    r"\bSELECT\s+(.+?)\s+INTO\s+(@\w+)",
    re.IGNORECASE,
)

_EXEC_ARG_PATTERN = re.compile(
    r"\b(?:EXEC(?:UTE)?)\s+((?:\[?\w+\]?\.)*\[?\w+\]?)\s+((?:@\w+\s*=\s*@\w+(?:\s*,\s*)?)+)",
    re.IGNORECASE,
)

_EXEC_POSITIONAL_PATTERN = re.compile(
    r"\b(?:EXEC(?:UTE)?)\s+((?:\[?\w+\]?\.)*\[?\w+\]?)\s+(@\w+(?:\s*,\s*@\w+)*)\s*(?:;|\n|$)",
    re.IGNORECASE,
)

_CONDITION_PATTERN = re.compile(
    r"\b(?:IF|WHILE|WHEN)\s+.*?(@\w+)",
    re.IGNORECASE,
)

_RETURN_PATTERN = re.compile(
    r"\bRETURN\s+(?:\()?.*?(@\w+)",
    re.IGNORECASE,
)

_WHERE_VAR_PATTERN = re.compile(
    r"\bWHERE\b.+?(@\w+)",
    re.IGNORECASE,
)

_INSERT_VAR_PATTERN = re.compile(
    r"\bVALUES\s*\(.*?(@\w+)",
    re.IGNORECASE,
)

_UPDATE_SET_VAR_PATTERN = re.compile(
    r"\bSET\s+\w+\s*=\s*(@\w+)",
    re.IGNORECASE,
)

_PARAM_IN_PATTERN = re.compile(
    r"@(\w+)\s+([\w]+(?:\([^)]*\))?)\s*(?:=\s*[^,)]+)?\s*(?:,|\))",
    re.IGNORECASE,
)

_PARAM_OUT_PATTERN = re.compile(
    r"@(\w+)\s+([\w]+(?:\([^)]*\))?)\s+(?:OUT(?:PUT)?)",
    re.IGNORECASE,
)


class VariableFlowAnalyzer:
    """Extracts variable references from SQL source code."""

    def extract_variable_references(
        self, sql: str, dialect: str = "tsql"  # noqa: ARG002
    ) -> list[VariableReference]:
        refs: list[VariableReference] = []

        def line_of(match: re.Match[str]) -> int:
            return sql[: match.start()].count("\n") + 1

        # 1. Parameters (IN)
        for m in _PARAM_IN_PATTERN.finditer(sql):
            refs.append(VariableReference(
                variable_name=f"@{m.group(1)}",
                reference_type="parameter_in",
                line_number=line_of(m),
                data_type=m.group(2),
            ))

        # 2. Parameters (OUT)
        for m in _PARAM_OUT_PATTERN.finditer(sql):
            refs.append(VariableReference(
                variable_name=f"@{m.group(1)}",
                reference_type="parameter_out",
                line_number=line_of(m),
                data_type=m.group(2),
            ))

        # 3. DECLARE
        for m in _DECLARE_PATTERN.finditer(sql):
            refs.append(VariableReference(
                variable_name=m.group(1),
                reference_type="declare",
                line_number=line_of(m),
                data_type=m.group(2),
            ))

        # 4. SET assignments
        for m in _SET_PATTERN.finditer(sql):
            # Skip UPDATE SET (those are update_set, not variable assignment)
            context_before = sql[max(0, m.start() - 100):m.start()]
            if re.search(r"\bUPDATE\b", context_before, re.IGNORECASE):
                continue
            refs.append(VariableReference(
                variable_name=m.group(1),
                reference_type="set",
                line_number=line_of(m),
                expression=m.group(2).strip()[:80],
            ))

        # 5. SELECT INTO
        for m in _SELECT_INTO_PATTERN.finditer(sql):
            refs.append(VariableReference(
                variable_name=m.group(2),
                reference_type="select_into",
                line_number=line_of(m),
                expression=m.group(1).strip()[:80],
            ))

        # 6. WHERE clause usage
        for m in _WHERE_VAR_PATTERN.finditer(sql):
            refs.append(VariableReference(
                variable_name=m.group(1),
                reference_type="where_clause",
                line_number=line_of(m),
            ))

        # 7. INSERT VALUES usage
        for m in _INSERT_VAR_PATTERN.finditer(sql):
            refs.append(VariableReference(
                variable_name=m.group(1),
                reference_type="insert_value",
                line_number=line_of(m),
            ))

        # 8. UPDATE SET usage (variable in UPDATE SET clause)
        for m in _UPDATE_SET_VAR_PATTERN.finditer(sql):
            # Only include if within an UPDATE context
            context_before = sql[max(0, m.start() - 200):m.start()]
            if re.search(r"\bUPDATE\b", context_before, re.IGNORECASE):
                refs.append(VariableReference(
                    variable_name=m.group(1),
                    reference_type="update_set",
                    line_number=line_of(m),
                ))

        # 9. EXEC argument mapping (named: @param = @variable)
        for m in _EXEC_ARG_PATTERN.finditer(sql):
            proc_name = m.group(1).replace("[", "").replace("]", "")
            arg_str = m.group(2)
            for arg_m in re.finditer(r"@(\w+)\s*=\s*(@\w+)", arg_str):
                refs.append(VariableReference(
                    variable_name=arg_m.group(2),
                    reference_type="exec_argument",
                    line_number=line_of(m),
                    target_variable=f"@{arg_m.group(1)}",
                    target_procedure=proc_name,
                ))

        # 10. EXEC positional arguments
        for m in _EXEC_POSITIONAL_PATTERN.finditer(sql):
            proc_name = m.group(1).replace("[", "").replace("]", "")
            args = [a.strip() for a in m.group(2).split(",")]
            for arg in args:
                if arg.startswith("@"):
                    refs.append(VariableReference(
                        variable_name=arg,
                        reference_type="exec_argument",
                        line_number=line_of(m),
                        target_procedure=proc_name,
                    ))

        # 11. Conditions (IF/WHILE/WHEN)
        for m in _CONDITION_PATTERN.finditer(sql):
            refs.append(VariableReference(
                variable_name=m.group(1),
                reference_type="condition",
                line_number=line_of(m),
            ))

        # 12. RETURN
        for m in _RETURN_PATTERN.finditer(sql):
            refs.append(VariableReference(
                variable_name=m.group(1),
                reference_type="return",
                line_number=line_of(m),
            ))

        # Deduplicate by (variable_name, reference_type, line_number)
        seen: set[tuple[str, str, int | None]] = set()
        unique: list[VariableReference] = []
        for ref in refs:
            key = (ref.variable_name, ref.reference_type, ref.line_number)
            if key not in seen:
                seen.add(key)
                unique.append(ref)

        return sorted(unique, key=lambda r: (r.line_number or 0, r.variable_name))
