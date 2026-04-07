"""Infrastructure: Dependency analyzer using SQLGlot AST + regex fallback."""

from __future__ import annotations

import re

import sqlglot
import structlog
from sqlglot import exp

from src.domain.entities.dependency import DependencyRef
from src.domain.entities.table_reference import TableRef
from src.domain.services.dependency_analyzer import IDependencyAnalyzer

logger = structlog.get_logger(__name__)

_EXEC_CALL_PATTERN = re.compile(
    r"\b(?:EXEC(?:UTE)?|CALL)\s+(?:\[?(\w+)\]?\.)?(?:\[?(\w+)\]?\.)?(\[?\w+\]?)",
    re.IGNORECASE,
)


class SqlGlotDependencyAnalyzer(IDependencyAnalyzer):
    def extract_call_dependencies(self, sql: str, dialect: str) -> list[DependencyRef]:
        deps: list[DependencyRef] = []
        seen: set[str] = set()

        try:
            parsed = sqlglot.parse(sql, read=dialect, error_level=sqlglot.ErrorLevel.IGNORE)
        except Exception as e:
            logger.warning(f"SQLGlot parse failed for call dependencies: {e}")
            parsed = []

        for stmt in parsed:
            if stmt is None:
                continue
            for call_node in stmt.find_all(exp.Anonymous):
                name = call_node.name
                if name and name not in seen:
                    seen.add(name)
                    deps.append(DependencyRef(
                        target_name=name, dependency_type="calls", confidence=0.8
                    ))

        # Regex fallback for EXEC/CALL
        for match in _EXEC_CALL_PATTERN.finditer(sql):
            groups = [g for g in match.groups() if g]
            name = ".".join(groups).replace("[", "").replace("]", "")
            if name not in seen:
                seen.add(name)
                deps.append(DependencyRef(
                    target_name=name,
                    dependency_type="calls",
                    line_number=sql[: match.start()].count("\n") + 1,
                    confidence=0.9,
                ))

        return deps

    def extract_table_references(self, sql: str, dialect: str) -> list[TableRef]:
        refs: list[TableRef] = []
        seen: set[tuple[str, str]] = set()

        try:
            parsed = sqlglot.parse(sql, read=dialect, error_level=sqlglot.ErrorLevel.IGNORE)
        except Exception as e:
            logger.warning(f"SQLGlot parse failed for table references: {e}")
            return refs

        for stmt in parsed:
            if stmt is None:
                continue
            for table in stmt.find_all(exp.Table):
                table_name = table.name
                schema = table.db or ""
                if not table_name:
                    continue
                full_name = f"{schema}.{table_name}" if schema else table_name
                op = self._get_operation(table)
                key = (full_name, op)
                if key not in seen:
                    seen.add(key)
                    refs.append(TableRef(
                        schema_name=schema or None,
                        table_name=table_name,
                        full_name=full_name,
                        operation=op,
                        is_temp_table=table_name.startswith(("#", "@")),
                    ))

        return refs

    def extract_dynamic_sql(self, sql: str, dialect: str) -> list[DependencyRef]:  # noqa: ARG002
        deps: list[DependencyRef] = []

        patterns = [
            (r"EXEC(?:UTE)?\s*\(\s*@", "Dynamic EXEC with variable"),
            (r"EXEC(?:UTE)?\s*\(\s*'[^']*'\s*\+", "String concatenation in EXEC"),
            (r"EXECUTE\s+IMMEDIATE", "PL/SQL EXECUTE IMMEDIATE"),
            (r"EXECUTE\s+format\s*\(", "PG EXECUTE format()"),
        ]

        for pattern, _desc in patterns:
            for match in re.finditer(pattern, sql, re.IGNORECASE):
                deps.append(DependencyRef(
                    target_name="<dynamic_sql>",
                    dependency_type="calls",
                    line_number=sql[: match.start()].count("\n") + 1,
                    is_dynamic=True,
                    confidence=0.5,
                    snippet=sql[match.start() : match.start() + 120],
                ))

        return deps

    def _get_operation(self, table: exp.Table) -> str:
        parent = table.parent
        while parent:
            if isinstance(parent, exp.Select):
                return "SELECT"
            if isinstance(parent, exp.Insert):
                return "INSERT"
            if isinstance(parent, exp.Update):
                return "UPDATE"
            if isinstance(parent, exp.Delete):
                return "DELETE"
            if isinstance(parent, exp.Merge):
                return "MERGE"
            parent = parent.parent
        return "SELECT"
