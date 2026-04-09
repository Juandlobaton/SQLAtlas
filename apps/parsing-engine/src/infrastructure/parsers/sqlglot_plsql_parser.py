"""Infrastructure: PL/SQL (Oracle) parser using SQLGlot."""

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


class SqlGlotPlSqlParser(SqlGlotBaseParser):
    @property
    def dialect(self) -> str:
        return "oracle"

    def supports_dialect(self, dialect: str) -> bool:
        return dialect.lower() in ("oracle", "plsql")

    def _extract_object(self, stmt: exp.Expression, full_sql: str) -> ParseResult | None:
        if not isinstance(stmt, exp.Create):
            return None

        kind = stmt.args.get("kind", "")
        kind_str = kind.upper() if isinstance(kind, str) else ""

        type_map = {
            "PROCEDURE": ObjectType.PROCEDURE,
            "FUNCTION": ObjectType.FUNCTION,
            "TRIGGER": ObjectType.TRIGGER,
            "VIEW": ObjectType.VIEW,
            "PACKAGE": ObjectType.PACKAGE,
        }
        obj_type = type_map.get(kind_str)
        if not obj_type:
            return None

        schema_name, object_name, fqn = self._extract_name(stmt.this, "DBO")
        params = (
            self._extract_parameters(stmt, full_sql)
            if obj_type not in (ObjectType.VIEW, ObjectType.TRIGGER)
            else []
        )
        deps = self._extract_dependencies(stmt, full_sql) if obj_type != ObjectType.VIEW else []
        table_refs = self._extract_table_references(stmt)
        security = self._analyze_security(full_sql)
        security.extend(self._oracle_security_rules(full_sql))
        complexity = self._analyze_complexity(stmt, full_sql)

        return_type = None
        if obj_type == ObjectType.FUNCTION:
            match = re.search(r"RETURN\s+(\w+(?:\([^)]*\))?)", full_sql, re.IGNORECASE)
            return_type = match.group(1) if match else None

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
            language="plsql",
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
            r"(\w+)\s+(IN\s+OUT|IN|OUT)?\s*(\w+(?:\([^)]*\))?)"
            r"(?:\s+DEFAULT\s+([^,)]+?))?(?:,|\)|\s*$)",
            re.IGNORECASE,
        )

        for i, match in enumerate(param_pattern.finditer(params_str)):
            name = match.group(1)
            mode = (match.group(2) or "IN").upper().replace(" ", "")
            if mode == "INOUT":
                mode = "INOUT"
            params.append(ParameterInfo(
                name=name,
                data_type=match.group(3),
                mode=mode,
                default_value=match.group(4).strip() if match.group(4) else None,
                ordinal_position=i + 1,
            ))

        return params

    def _oracle_security_rules(self, sql: str) -> list[SecurityFinding]:
        findings: list[SecurityFinding] = []

        if (
            re.search(r"EXECUTE\s+IMMEDIATE", sql, re.IGNORECASE)
            and not re.search(r"USING\s+", sql, re.IGNORECASE)
        ):
            findings.append(SecurityFinding(
                severity=Severity.HIGH,
                finding_type="sql_injection_risk",
                message="EXECUTE IMMEDIATE without USING clause",
                recommendation="Use bind variables with USING clause",
            ))

        if re.search(r"DBMS_SQL", sql, re.IGNORECASE):
            findings.append(SecurityFinding(
                severity=Severity.MEDIUM,
                finding_type="dynamic_sql",
                message="DBMS_SQL usage — low-level dynamic SQL interface",
                recommendation="Prefer EXECUTE IMMEDIATE with bind variables when possible",
            ))

        if re.search(r"UTL_HTTP|UTL_FILE|UTL_SMTP", sql, re.IGNORECASE):
            findings.append(SecurityFinding(
                severity=Severity.HIGH,
                finding_type="external_access",
                message="Oracle utility package for external access (HTTP/File/SMTP)",
                recommendation="Review external access permissions and URL/path validation",
            ))

        if re.search(r"AUTHID\s+DEFINER", sql, re.IGNORECASE):
            findings.append(SecurityFinding(
                severity=Severity.MEDIUM,
                finding_type="privilege_escalation",
                message="Procedure runs with AUTHID DEFINER (owner privileges)",
                recommendation="Consider AUTHID CURRENT_USER for least-privilege",
            ))

        return findings
