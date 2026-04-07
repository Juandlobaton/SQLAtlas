"""Infrastructure: Base class for SQLGlot-powered parsers.

SQLGlot lives ONLY here in infrastructure. The domain never imports it.
This class implements the ISqlParser contract from the domain layer.
"""

from __future__ import annotations

import re
from abc import abstractmethod
from typing import TYPE_CHECKING, Any, cast

import sqlglot
from sqlglot import exp

from src.domain.entities.complexity import ComplexityMetrics
from src.domain.entities.dependency import DependencyRef
from src.domain.entities.flow_node import FlowNode
from src.domain.entities.parse_result import ParseResult
from src.domain.entities.security_finding import SecurityFinding
from src.domain.entities.table_reference import TableRef
from src.domain.services.sql_parser import ISqlParser
from src.domain.value_objects.object_type import ObjectType
from src.domain.value_objects.severity import Severity
from src.domain.value_objects.sql_hash import SqlHash
from src.infrastructure.analyzers.variable_flow_analyzer import VariableFlowAnalyzer

if TYPE_CHECKING:
    from src.domain.entities.parameter import ParameterInfo
    from src.domain.entities.variable_reference import VariableReference

_EXEC_CALL_PATTERN = re.compile(
    r"\b(?:EXEC(?:UTE)?|CALL)\s+(?:\[?(\w+)\]?\.)?(?:\[?(\w+)\]?\.)?(\[?\w+\]?)",
    re.IGNORECASE,
)
_DYNAMIC_EXEC_PATTERN = re.compile(r"\b(?:EXEC(?:UTE)?)\s*\(\s*@", re.IGNORECASE)

# PL/pgSQL: PERFORM schema.function(...) or direct schema.function(...) calls
_PERFORM_PATTERN = re.compile(
    r"\bPERFORM\s+(\w+)\.(\w+)\s*\(",
    re.IGNORECASE,
)
_PLPGSQL_CALL_PATTERN = re.compile(
    r"(?::=|INTO|SELECT)\s+(\w+)\.(\w+)\s*\(",
    re.IGNORECASE,
)

# PL/SQL (Oracle): Direct procedure calls without schema prefix
# Matches: "  reserve_stock(args);" or "  log_activity('x', 1, 'y');" at start of line
_PLSQL_DIRECT_CALL = re.compile(
    r"^\s+(\w+)\s*\(",
    re.IGNORECASE | re.MULTILINE,
)

_SYSTEM_FUNCTIONS = frozenset({
    "GETDATE", "GETUTCDATE", "SYSDATETIME", "NEWID", "ISNULL", "COALESCE",
    "CAST", "CONVERT", "LEN", "TRIM", "LTRIM", "RTRIM", "UPPER", "LOWER",
    "SUBSTRING", "REPLACE", "CHARINDEX", "PATINDEX", "LEFT", "RIGHT",
    "DATEADD", "DATEDIFF", "DATEPART", "YEAR", "MONTH", "DAY",
    "ABS", "CEILING", "FLOOR", "ROUND", "POWER", "SQRT",
    "COUNT", "SUM", "AVG", "MIN", "MAX", "ROW_NUMBER", "RANK", "DENSE_RANK",
    "ISNUMERIC", "ISDATE", "NULLIF", "IIF", "CHOOSE",
    "FORMAT", "CONCAT", "STRING_AGG", "STUFF", "QUOTENAME",
    "OBJECT_ID", "OBJECT_NAME", "DB_ID", "DB_NAME", "SCHEMA_NAME",
    "SCOPE_IDENTITY", "IDENT_CURRENT", "ERROR_MESSAGE", "ERROR_NUMBER",
    "NOW", "CURRENT_TIMESTAMP", "CURRENT_DATE", "CURRENT_USER",
    "GREATEST", "LEAST", "LENGTH", "SUBSTR", "INSTR", "NVL", "NVL2", "DECODE",
    "TO_CHAR", "TO_DATE", "TO_NUMBER", "SYSDATE", "SYSTIMESTAMP",
    "TRUNC", "MOD", "SIGN", "CHR", "ASCII",
    "RAISE_APPLICATION_ERROR", "ARRAY_AGG", "JSON_AGG", "JSONB_AGG",
    "JSON_BUILD_OBJECT", "REGEXP_MATCH", "REGEXP_REPLACE",
    "NEXTVAL", "CURRVAL", "SETVAL",
})


class SqlGlotBaseParser(ISqlParser):
    """Base infrastructure parser using SQLGlot."""

    @property
    @abstractmethod
    def dialect(self) -> str: ...

    def supports_dialect(self, dialect: str) -> bool:
        return dialect.lower() == self.dialect

    def parse(self, sql: str) -> list[ParseResult]:
        results: list[ParseResult] = []

        try:
            statements = sqlglot.parse(
                sql, read=self.dialect, error_level=sqlglot.ErrorLevel.WARN
            )
        except sqlglot.errors.ParseError:
            statements = sqlglot.parse(sql, error_level=sqlglot.ErrorLevel.IGNORE)

        for stmt in statements:
            if stmt is None:
                continue
            result = self._extract_object(cast("exp.Expression", stmt), sql)
            if result:
                results.append(result)

        if not results:
            result = self._parse_anonymous_block(sql)
            if result:
                results.append(result)

        return results

    @abstractmethod
    def _extract_object(self, stmt: exp.Expression, full_sql: str) -> ParseResult | None:
        """Extract a named database object from a parsed statement."""

    @abstractmethod
    def _extract_parameters(self, stmt: exp.Expression, sql: str) -> list[ParameterInfo]:
        """Extract parameter definitions."""

    def _extract_name(
        self, name_expr: exp.Expression | None, default_schema: str
    ) -> tuple[str, str, str]:
        if name_expr is None:
            return (default_schema, "<unknown>", f"{default_schema}.<unknown>")

        if isinstance(name_expr, exp.Table):
            schema = name_expr.db or default_schema
            name = name_expr.name or "<unknown>"
            return (schema, name, f"{schema}.{name}")

        name_str = name_expr.sql(dialect=self.dialect) if name_expr else "<unknown>"
        parts = name_str.replace("[", "").replace("]", "").replace('"', "").split(".")
        if len(parts) >= 2:
            return (parts[-2], parts[-1], ".".join(parts))
        return (default_schema, parts[0], f"{default_schema}.{parts[0]}")

    # ── Dependency extraction ───────────────────────────────────────

    def _extract_dependencies(self, stmt: exp.Expression, sql: str) -> list[DependencyRef]:
        deps: list[DependencyRef] = []
        seen: set[str] = set()

        for call_node in stmt.find_all(exp.Anonymous):
            name = call_node.name
            if name and name.upper() not in _SYSTEM_FUNCTIONS and name not in seen:
                seen.add(name)
                deps.append(DependencyRef(
                    target_name=name, dependency_type="calls", confidence=0.8
                ))

        self._extract_exec_calls(sql, deps, seen)
        return deps

    def _extract_exec_calls(
        self, sql: str, deps: list[DependencyRef], seen: set[str]
    ) -> None:
        for match in _EXEC_CALL_PATTERN.finditer(sql):
            groups = [g for g in match.groups() if g]
            name = ".".join(groups).replace("[", "").replace("]", "")
            if name not in seen and name.upper() not in _SYSTEM_FUNCTIONS:
                seen.add(name)
                deps.append(DependencyRef(
                    target_name=name,
                    dependency_type="calls",
                    line_number=sql[: match.start()].count("\n") + 1,
                    confidence=0.9,
                ))

        for match in _DYNAMIC_EXEC_PATTERN.finditer(sql):
            deps.append(DependencyRef(
                target_name="<dynamic_sql>",
                dependency_type="calls",
                line_number=sql[: match.start()].count("\n") + 1,
                is_dynamic=True,
                confidence=0.5,
                snippet=sql[match.start() : match.start() + 100],
            ))

        # PL/pgSQL: PERFORM schema.function(...)
        for match in _PERFORM_PATTERN.finditer(sql):
            schema, func = match.group(1), match.group(2)
            name = f"{schema}.{func}"
            if name not in seen and func.upper() not in _SYSTEM_FUNCTIONS:
                seen.add(name)
                deps.append(DependencyRef(
                    target_name=name,
                    dependency_type="calls",
                    line_number=sql[: match.start()].count("\n") + 1,
                    confidence=0.95,
                ))

        # PL/pgSQL: direct calls like := schema.func(...) or SELECT INTO ... schema.func(...)
        for match in _PLPGSQL_CALL_PATTERN.finditer(sql):
            schema, func = match.group(1), match.group(2)
            name = f"{schema}.{func}"
            if name not in seen and func.upper() not in _SYSTEM_FUNCTIONS:
                seen.add(name)
                deps.append(DependencyRef(
                    target_name=name,
                    dependency_type="calls",
                    line_number=sql[: match.start()].count("\n") + 1,
                    confidence=0.85,
                ))

        # PL/SQL (Oracle): direct calls like "  procedure_name(args);" without EXEC/CALL/PERFORM
        # Only for oracle/plsql dialect to avoid false positives
        if self.dialect in ('oracle',):
            # Common PL/SQL keywords that look like function calls but aren't
            plsql_keywords = _SYSTEM_FUNCTIONS | {
                'IF', 'ELSIF', 'WHILE', 'FOR', 'LOOP', 'RETURN', 'RAISE', 'EXCEPTION',
                'BEGIN', 'END', 'DECLARE', 'CURSOR', 'OPEN', 'CLOSE', 'FETCH',
                'COMMIT', 'ROLLBACK', 'SAVEPOINT', 'NULL', 'EXIT', 'CONTINUE',
                'DBMS_OUTPUT', 'PUT_LINE', 'RAISE_APPLICATION_ERROR',
            }
            for match in _PLSQL_DIRECT_CALL.finditer(sql):
                func = match.group(1)
                if (func not in seen
                    and func.upper() not in plsql_keywords
                    and not func.startswith('v_') and not func.startswith('p_')
                    and not func.startswith('l_') and not func.upper().startswith('SYS')
                    and len(func) > 2):
                    seen.add(func)
                    deps.append(DependencyRef(
                        target_name=func,
                        dependency_type="calls",
                        line_number=sql[: match.start()].count("\n") + 1,
                        confidence=0.7,
                    ))

    # ── Table reference extraction ──────────────────────────────────

    def _extract_table_references(self, stmt: exp.Expression) -> list[TableRef]:
        refs: list[TableRef] = []
        seen: set[tuple[str, str]] = set()

        for table in stmt.find_all(exp.Table):
            table_name = table.name
            schema = table.db or ""
            if not table_name:
                continue

            full_name = f"{schema}.{table_name}" if schema else table_name
            op = self._determine_table_operation(table)
            key = (full_name, op)

            if key not in seen:
                seen.add(key)
                is_temp = table_name.startswith(("#", "@")) or table_name.upper().startswith("TEMP")
                refs.append(TableRef(
                    schema_name=schema or None,
                    table_name=table_name,
                    full_name=full_name,
                    operation=op,
                    is_temp_table=is_temp,
                ))

        return refs

    def _determine_table_operation(self, table: exp.Table) -> str:
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

    # ── Complexity metrics ──────────────────────────────────────────

    def _analyze_complexity(self, stmt: exp.Expression, sql: str) -> ComplexityMetrics:
        line_count = sql.count("\n") + 1

        ast_branches = 0
        for node in stmt.walk():
            if isinstance(node, exp.If | exp.Case | exp.And | exp.Or):
                ast_branches += 1

        branch_keywords = re.findall(
            r"\b(IF|ELSE\s*IF|ELSIF|WHEN|WHILE|LOOP|FOR|CURSOR|EXCEPTION|CATCH)\b",
            sql,
            re.IGNORECASE,
        )
        branch_count = max(ast_branches, len(branch_keywords))
        cc = max(ast_branches + 1, len(branch_keywords) + 1)

        loop_keywords = re.findall(r"\b(WHILE|LOOP|FOR|CURSOR)\b", sql, re.IGNORECASE)

        nesting = 0
        max_nesting = 0
        for kw in re.findall(r"\b(BEGIN|IF|WHILE|LOOP|FOR|CASE|END)\b", sql, re.IGNORECASE):
            if kw.upper() != "END":
                nesting += 1
                max_nesting = max(max_nesting, nesting)
            else:
                nesting = max(0, nesting - 1)

        return ComplexityMetrics(
            cyclomatic_complexity=cc,
            nesting_depth=max_nesting,
            branch_count=branch_count,
            loop_count=len(loop_keywords),
            line_count=line_count,
        )

    # ── Variable flow analysis ────────────────────────────────────────

    _variable_analyzer = VariableFlowAnalyzer()

    def _extract_variable_references(self, sql: str) -> list[VariableReference]:
        """Extract all variable declarations, assignments, and usages."""
        return self._variable_analyzer.extract_variable_references(sql, self.dialect)

    # ── Security scanning ───────────────────────────────────────────

    def _analyze_security(self, sql: str) -> list[SecurityFinding]:
        findings: list[SecurityFinding] = []

        rules = [
            (r"EXEC(?:UTE)?\s*\(\s*@\w+", Severity.HIGH, "sql_injection_risk",
             "Dynamic SQL execution with variable",
             "Use parameterized queries or sp_executesql with parameters"),
            (r"EXEC(?:UTE)?\s*\(\s*'[^']*'\s*\+", Severity.HIGH, "sql_injection_risk",
             "String concatenation in EXEC",
             "Use parameterized queries"),
            (r"sp_executesql\s+@\w+", Severity.MEDIUM, "sql_injection_risk",
             "sp_executesql with dynamic string",
             "Verify parameters are properly bound"),
            (r"EXECUTE\s+IMMEDIATE", Severity.HIGH, "sql_injection_risk",
             "PL/SQL EXECUTE IMMEDIATE",
             "Use bind variables"),
            (r"\bxp_cmdshell\b", Severity.CRITICAL, "os_command_execution",
             "xp_cmdshell allows OS command execution",
             "Remove xp_cmdshell; use safer alternatives"),
            (r"\bOPENROWSET\b|\bOPENDATASOURCE\b", Severity.HIGH, "external_access",
             "External data access via OPENROWSET/OPENDATASOURCE",
             "Review if external data access is necessary"),
            (r"\bGRANT\b", Severity.MEDIUM, "privilege_escalation",
             "GRANT statement in procedure body",
             "Avoid granting permissions inside stored procedures"),
            (r"WITH\s+EXECUTE\s+AS\s+", Severity.MEDIUM, "impersonation",
             "EXECUTE AS context switching",
             "Review impersonation for least-privilege principle"),
        ]

        for pattern, severity, finding_type, message, recommendation in rules:
            for match in re.finditer(pattern, sql, re.IGNORECASE):
                line = sql[: match.start()].count("\n") + 1
                findings.append(SecurityFinding(
                    severity=severity,
                    finding_type=finding_type,
                    message=message,
                    line=line,
                    recommendation=recommendation,
                ))

        pwd_patterns = re.findall(
            r"(?:password|pwd|passwd|secret)\s*[=:]\s*['\"]([^'\"]+)['\"]",
            sql,
            re.IGNORECASE,
        )
        if pwd_patterns:
            findings.append(SecurityFinding(
                severity=Severity.CRITICAL,
                finding_type="hardcoded_credentials",
                message="Hardcoded credentials detected",
                recommendation="Use environment variables or a secrets manager",
            ))

        return findings

    # ── Flow tree builder ───────────────────────────────────────────

    def _build_flow_tree(self, sql: str) -> FlowNode:
        root = FlowNode(node_id="start", node_type="start", label="Start", line_number=1)

        lines = sql.split("\n")
        node_counter = 0
        for i, line in enumerate(lines, 1):
            stripped = line.strip().upper()
            if not stripped or stripped.startswith(("--", "/*")):
                continue

            node_type = None
            if re.match(r"\bIF\b", stripped):
                node_type = "condition"
            elif re.match(r"\b(WHILE|LOOP|FOR)\b", stripped):
                node_type = "loop"
            elif re.match(r"\b(EXEC|EXECUTE|CALL)\b", stripped):
                node_type = "call"
            elif re.match(r"\b(INSERT|UPDATE|DELETE|MERGE|SELECT\s+INTO)\b", stripped):
                node_type = "statement"
            elif re.match(r"\b(RETURN|RAISE|RAISERROR|THROW)\b", stripped):
                node_type = "return" if "RETURN" in stripped else "error_handler"
            elif re.match(r"\b(BEGIN\s+TRY|BEGIN\s+CATCH|EXCEPTION)\b", stripped):
                node_type = "error_handler"

            if node_type:
                node_counter += 1
                root.children.append(FlowNode(
                    node_id=f"n{node_counter}",
                    node_type=node_type,
                    label=line.strip()[:80],
                    line_number=i,
                ))

        root.children.append(FlowNode(
            node_id="end", node_type="end", label="End", line_number=len(lines)
        ))
        return root

    # ── Auto-documentation ──────────────────────────────────────────

    def _generate_auto_doc(
        self,
        name: str,
        params: list[ParameterInfo],
        table_refs: list[TableRef],
        deps: list[DependencyRef],
        complexity: ComplexityMetrics | None,
        return_type: str | None = None,
    ) -> dict[str, Any]:
        tables_accessed = [
            {"tableName": r.full_name, "operation": r.operation}
            for r in table_refs
        ]

        side_effects = [
            f"{r.operation} on {r.full_name}"
            for r in table_refs
            if r.is_write_operation()
        ]

        called_procs = [d.target_name for d in deps if d.is_call() and not d.is_dynamic]
        if called_procs:
            side_effects.append(f"Calls: {', '.join(called_procs)}")

        param_docs = {
            p.name: f"({p.mode}) {p.data_type}"
            + (f" = {p.default_value}" if p.has_default() else "")
            for p in params
        }

        read_tables = [r.full_name for r in table_refs if r.is_read_operation()]
        write_tables = [r.full_name for r in table_refs if r.is_write_operation()]
        summary_parts = [f"Procedure {name}"]
        if read_tables:
            summary_parts.append(f"reads from {', '.join(read_tables[:3])}")
        if write_tables:
            summary_parts.append(f"writes to {', '.join(write_tables[:3])}")

        return {
            "summary": ". ".join(summary_parts),
            "description": (
                f"{'Function' if return_type else 'Procedure'} with {len(params)} parameters, "
                f"accessing {len(table_refs)} tables, "
                f"calling {len(called_procs)} other procedures."
            ),
            "parameterDocs": param_docs,
            "returns": return_type,
            "sideEffects": side_effects,
            "tablesAccessed": tables_accessed,
            "complexity": complexity.to_dict() if complexity else None,
        }

    # ── Anonymous block fallback ────────────────────────────────────

    def _parse_anonymous_block(self, sql: str) -> ParseResult | None:
        try:
            parsed = sqlglot.parse(sql, read=self.dialect, error_level=sqlglot.ErrorLevel.IGNORE)
        except Exception:
            return None

        if not parsed:
            return None

        first = parsed[0]
        if first is None:
            return None

        stmt = cast("exp.Expression", first)
        deps = self._extract_dependencies(stmt, sql)
        table_refs = self._extract_table_references(stmt)
        security = self._analyze_security(sql)
        complexity = self._analyze_complexity(stmt, sql)

        return ParseResult(
            object_name="<anonymous>",
            object_type=ObjectType.PROCEDURE,
            schema_name="",
            full_qualified_name="<anonymous>",
            raw_definition=sql,
            definition_hash=SqlHash.from_sql(sql),
            language=self.dialect,
            parameters=[],
            return_type=None,
            dependencies=deps,
            table_references=table_refs,
            security_findings=security,
            flow_tree=self._build_flow_tree(sql),
            line_count=sql.count("\n") + 1,
            complexity=complexity,
            auto_doc=self._generate_auto_doc("<anonymous>", [], table_refs, deps, complexity),
            variable_references=self._extract_variable_references(sql),
        )
