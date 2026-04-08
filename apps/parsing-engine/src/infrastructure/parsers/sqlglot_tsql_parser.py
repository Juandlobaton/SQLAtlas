"""Infrastructure: T-SQL (SQL Server) parser using SQLGlot."""

from __future__ import annotations

import re
from typing import TYPE_CHECKING

from sqlglot import exp

from src.domain.entities.parameter import ParameterInfo

if TYPE_CHECKING:
    from src.domain.entities.dependency import DependencyRef
from src.domain.entities.parse_result import ParseResult
from src.domain.value_objects.object_type import ObjectType
from src.domain.value_objects.sql_hash import SqlHash
from src.infrastructure.parsers.sqlglot_base import SqlGlotBaseParser


class SqlGlotTSqlParser(SqlGlotBaseParser):
    @property
    def dialect(self) -> str:
        return "tsql"

    def _extract_object(self, stmt: exp.Expression, full_sql: str) -> ParseResult | None:
        if not isinstance(stmt, exp.Create):
            return None

        kind = stmt.args.get("kind", "")
        kind_str = kind.upper() if isinstance(kind, str) else ""

        type_map = {
            "PROCEDURE": ObjectType.PROCEDURE,
            "PROC": ObjectType.PROCEDURE,
            "FUNCTION": ObjectType.FUNCTION,
            "TRIGGER": ObjectType.TRIGGER,
            "VIEW": ObjectType.VIEW,
        }
        obj_type = type_map.get(kind_str)
        if not obj_type:
            return None

        schema_name, object_name, fqn = self._extract_name(stmt.this, "dbo")
        params = self._extract_parameters(stmt, full_sql) if obj_type != ObjectType.VIEW else []
        deps = self._extract_dependencies(stmt, full_sql) if obj_type != ObjectType.VIEW else []
        table_refs = self._extract_table_references(stmt)
        security = self._analyze_security(full_sql) if obj_type != ObjectType.VIEW else []
        complexity = self._analyze_complexity(stmt, full_sql)

        return_type = None
        if obj_type == ObjectType.FUNCTION:
            match = re.search(r"RETURNS\s+(\w+(?:\([^)]*\))?)", full_sql, re.IGNORECASE)
            return_type = match.group(1) if match else None

        # T-SQL-specific: linked server references
        self._extract_linked_server_refs(full_sql, deps)

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
            language="tsql",
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
        param_pattern = re.compile(
            r"(@\w+)\s+(\w+(?:\([^)]*\))?)"
            r"(?:\s*=\s*([^,\n]+?))?"
            r"(?:\s+(OUTPUT|OUT))?\s*(?:,|$|\n)",
            re.IGNORECASE,
        )

        for i, match in enumerate(param_pattern.finditer(sql)):
            name = match.group(1)
            data_type = match.group(2).strip()
            default = match.group(3).strip() if match.group(3) else None
            is_output = match.group(4) is not None

            params.append(ParameterInfo(
                name=name,
                data_type=data_type,
                mode="INOUT" if is_output else "IN",
                default_value=default,
                ordinal_position=i + 1,
            ))

        return params

    def _extract_linked_server_refs(
        self, sql: str, deps: list[DependencyRef]
    ) -> None:
        from src.domain.entities.dependency import DependencyRef

        seen = {d.target_name for d in deps}
        linked_pattern = re.compile(
            r"\[?(\w+)\]?\.\[?(\w+)\]?\.\[?(\w+)\]?\.\[?(\w+)\]?"
        )
        for match in linked_pattern.finditer(sql):
            server, db, schema, obj = match.groups()
            full_name = f"{server}.{db}.{schema}.{obj}"
            if full_name not in seen:
                seen.add(full_name)
                deps.append(DependencyRef(
                    target_name=full_name,
                    dependency_type="references",
                    line_number=sql[: match.start()].count("\n") + 1,
                    confidence=0.7,
                ))
