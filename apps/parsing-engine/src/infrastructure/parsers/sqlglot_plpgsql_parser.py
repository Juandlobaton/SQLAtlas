"""Infrastructure: PL/pgSQL (PostgreSQL) parser using SQLGlot."""

from __future__ import annotations

import re

from sqlglot import exp

from src.domain.entities.parameter import ParameterInfo
from src.domain.entities.parse_result import ParseResult
from src.domain.entities.security_finding import SecurityFinding
from src.domain.value_objects.object_type import ObjectType
from src.domain.value_objects.severity import Severity
from src.domain.value_objects.sql_hash import SqlHash
from src.infrastructure.parsers.sqlglot_base import SqlGlotBaseParser


class SqlGlotPlPgSqlParser(SqlGlotBaseParser):
    @property
    def dialect(self) -> str:
        return "postgres"

    def supports_dialect(self, dialect: str) -> bool:
        return dialect.lower() in ("postgres", "postgresql", "plpgsql")

    def _extract_object(self, stmt: exp.Expression, full_sql: str) -> ParseResult | None:
        if not isinstance(stmt, exp.Create):
            return None

        kind = stmt.args.get("kind", "")
        kind_str = kind.upper() if isinstance(kind, str) else ""

        type_map = {
            "FUNCTION": ObjectType.FUNCTION,
            "PROCEDURE": ObjectType.PROCEDURE,
            "TRIGGER": ObjectType.TRIGGER,
            "VIEW": ObjectType.VIEW,
        }
        obj_type = type_map.get(kind_str)
        if not obj_type:
            return None

        schema_name, object_name, fqn = self._extract_name(stmt.this, "public")
        params = (
            self._extract_parameters(stmt, full_sql)
            if obj_type not in (ObjectType.VIEW, ObjectType.TRIGGER)
            else []
        )
        deps = self._extract_dependencies(stmt, full_sql) if obj_type != ObjectType.VIEW else []
        table_refs = self._extract_table_references(stmt)
        security = self._analyze_security(full_sql)

        # PG-specific security rules
        security.extend(self._pg_security_rules(full_sql))

        complexity = self._analyze_complexity(stmt, full_sql)
        return_type = self._extract_return_type(full_sql)

        flow_tree = self._build_flow_tree(full_sql) if obj_type != ObjectType.VIEW else None

        auto_doc = self._generate_auto_doc(
            object_name, params, table_refs, deps, complexity, return_type,
            raw_sql=full_sql, flow_tree=flow_tree,
        )

        return ParseResult(
            object_name=object_name,
            object_type=obj_type,
            schema_name=schema_name,
            full_qualified_name=fqn,
            raw_definition=full_sql,
            definition_hash=SqlHash.from_sql(full_sql),
            language="plpgsql",
            parameters=params,
            return_type=return_type,
            dependencies=deps,
            table_references=table_refs,
            security_findings=security,
            flow_tree=flow_tree,
            line_count=full_sql.count("\n") + 1,
            complexity=complexity,
            auto_doc=auto_doc,
            variable_references=self._extract_variable_references(full_sql),
        )

    def _extract_parameters(self, stmt: exp.Expression, sql: str) -> list[ParameterInfo]:  # noqa: ARG002
        params: list[ParameterInfo] = []
        paren_match = re.search(r"\((.*?)\)", sql, re.DOTALL)
        if not paren_match:
            return params

        params_str = paren_match.group(1)
        param_pattern = re.compile(
            r"(?:(IN|OUT|INOUT)\s+)?(\w+)\s+(\w+(?:\[\])?(?:\([^)]*\))?)"
            r"(?:\s+DEFAULT\s+([^,)]+?))?(?:,|\)|\s*$)",
            re.IGNORECASE,
        )

        for i, match in enumerate(param_pattern.finditer(params_str)):
            mode = (match.group(1) or "IN").upper()
            params.append(ParameterInfo(
                name=match.group(2),
                data_type=match.group(3),
                mode=mode,
                default_value=match.group(4).strip() if match.group(4) else None,
                ordinal_position=i + 1,
            ))

        return params

    def _extract_return_type(self, sql: str) -> str | None:
        match = re.search(
            r"RETURNS\s+(SETOF\s+)?(\w+(?:\[\])?(?:\([^)]*\))?)", sql, re.IGNORECASE
        )
        if match:
            setof = match.group(1) or ""
            return f"{setof}{match.group(2)}".strip()

        match = re.search(r"RETURNS\s+TABLE\s*\(([^)]+)\)", sql, re.IGNORECASE)
        if match:
            return f"TABLE({match.group(1).strip()})"

        return None

    def _pg_security_rules(self, sql: str) -> list[SecurityFinding]:
        findings: list[SecurityFinding] = []

        if re.search(r"SECURITY\s+DEFINER", sql, re.IGNORECASE):
            findings.append(SecurityFinding(
                severity=Severity.MEDIUM,
                finding_type="security_definer",
                message="Function runs with SECURITY DEFINER (owner privileges)",
                recommendation="Consider SECURITY INVOKER; ensure owner has minimal privileges",
            ))

        if (
            re.search(r"EXECUTE\s+format\s*\(", sql, re.IGNORECASE)
            and not re.search(r"format\s*\([^,]+,\s*\$\d+", sql, re.IGNORECASE)
        ):
            findings.append(SecurityFinding(
                severity=Severity.HIGH,
                finding_type="sql_injection_risk",
                message="EXECUTE with format() — verify %I/%L usage",
                recommendation="Use %I for identifiers and %L for literals in format()",
            ))

        if re.search(r"\bdblink\b", sql, re.IGNORECASE):
            findings.append(SecurityFinding(
                severity=Severity.HIGH,
                finding_type="external_access",
                message="dblink usage — cross-database access",
                recommendation="Review connection strings for hardcoded credentials",
            ))

        return findings
