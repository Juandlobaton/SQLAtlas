"""Infrastructure: Flow tree builder facade.

Selects the appropriate dialect-specific engine and delegates parsing.
Implements IFlowBuilder so consumers (container, use cases) need no changes.
"""

from __future__ import annotations

import logging
import re

import sqlglot
from sqlglot import exp

from src.domain.entities.complexity import ComplexityMetrics
from src.domain.entities.flow_node import FlowNode
from src.domain.services.flow_builder import IFlowBuilder
from src.infrastructure.analyzers.flow_builder_plpgsql import PlpgsqlFlowEngine
from src.infrastructure.analyzers.flow_builder_plsql import PlsqlFlowEngine
from src.infrastructure.analyzers.flow_builder_tsql import TsqlFlowEngine

logger = logging.getLogger(__name__)

_DIALECT_MAP: dict[str, type] = {
    "tsql": TsqlFlowEngine,
    "sqlserver": TsqlFlowEngine,
    "plsql": PlsqlFlowEngine,
    "oracle": PlsqlFlowEngine,
    "plpgsql": PlpgsqlFlowEngine,
    "postgres": PlpgsqlFlowEngine,
    "postgresql": PlpgsqlFlowEngine,
}


class HybridFlowBuilder(IFlowBuilder):
    """Factory/facade: selects dialect engine, delegates parsing."""

    def build_flow_tree(self, sql: str, dialect: str) -> FlowNode:
        try:
            engine_cls = _DIALECT_MAP.get(dialect.lower(), TsqlFlowEngine)
            engine = engine_cls(sql)
            return engine.parse()
        except Exception as e:
            logger.warning(f"Flow builder failed, using fallback: {e}")
            return self._build_flat_fallback(sql)

    def _build_flat_fallback(self, sql: str) -> FlowNode:
        """Original flat algorithm as fallback."""
        root = FlowNode(node_id="start", node_type="start", label="Start", line_number=1)
        counter = 0
        lines = sql.split("\n")
        for i, line in enumerate(lines, 1):
            stripped = line.strip().upper()
            if not stripped or stripped.startswith(("--", "/*")):
                continue
            node_type = self._classify_line(stripped)
            if node_type:
                counter += 1
                root.children.append(FlowNode(
                    node_id=f"n{counter}",
                    node_type=node_type,
                    label=line.strip()[:80],
                    line_number=i,
                ))
        root.children.append(FlowNode(
            node_id="end", node_type="end", label="End", line_number=len(lines),
        ))
        return root

    def calculate_complexity(self, sql: str, dialect: str) -> ComplexityMetrics:
        line_count = sql.count("\n") + 1

        ast_branches = 0
        try:
            parsed = sqlglot.parse(sql, read=dialect, error_level=sqlglot.ErrorLevel.IGNORE)
            for stmt in parsed:
                if stmt is None:
                    continue
                for node in stmt.walk():
                    if isinstance(node, exp.If | exp.Case | exp.And | exp.Or):
                        ast_branches += 1
        except Exception as e:
            logger.warning(f"AST-based complexity analysis failed: {e}")

        branch_keywords = re.findall(
            r"\b(IF|ELSE\s*IF|ELSIF|WHEN|WHILE|LOOP|FOR|CURSOR|EXCEPTION|CATCH)\b",
            sql, re.IGNORECASE,
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

    @staticmethod
    def _classify_line(stripped: str) -> str | None:
        if re.match(r"\bIF\b", stripped):
            return "condition"
        if re.match(r"\b(WHILE|LOOP|FOR)\b", stripped):
            return "loop"
        if re.match(r"\b(EXEC|EXECUTE|CALL|PERFORM)\b", stripped):
            return "call"
        if re.match(r"\b(INSERT|UPDATE|DELETE|MERGE|SELECT\s+INTO)\b", stripped):
            return "statement"
        if re.match(r"\b(RETURN|RAISE|RAISERROR|THROW)\b", stripped):
            return "return" if "RETURN" in stripped else "error_handler"
        if re.match(r"\b(BEGIN\s+TRY|BEGIN\s+CATCH|EXCEPTION)\b", stripped):
            return "error_handler"
        return None
