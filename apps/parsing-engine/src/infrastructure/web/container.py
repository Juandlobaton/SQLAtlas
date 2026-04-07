"""Composition Root: Wires domain interfaces to infrastructure implementations.

This is the ONLY place in the entire application that knows about both
the domain contracts AND the concrete implementations.
"""

from __future__ import annotations

import functools
from typing import TYPE_CHECKING

from src.application.use_cases.analyze_sql import AnalyzeSqlUseCase
from src.application.use_cases.batch_parse import BatchParseUseCase
from src.application.use_cases.parse_sql import ParseSqlUseCase
from src.infrastructure.analyzers.auto_doc_generator import AutoDocGenerator

if TYPE_CHECKING:
    from src.domain.services.sql_parser import ISqlParser
from src.infrastructure.analyzers.hybrid_flow_builder import HybridFlowBuilder
from src.infrastructure.analyzers.regex_security_scanner import RegexSecurityScanner
from src.infrastructure.analyzers.sqlglot_dependency_analyzer import SqlGlotDependencyAnalyzer
from src.infrastructure.parsers.sqlglot_plpgsql_parser import SqlGlotPlPgSqlParser
from src.infrastructure.parsers.sqlglot_plsql_parser import SqlGlotPlSqlParser
from src.infrastructure.parsers.sqlglot_tsql_parser import SqlGlotTSqlParser


class Container:
    """Dependency injection container. Created once at app startup."""

    def __init__(self) -> None:
        # Infrastructure implementations
        self._tsql_parser = SqlGlotTSqlParser()
        self._plpgsql_parser = SqlGlotPlPgSqlParser()
        self._plsql_parser = SqlGlotPlSqlParser()

        self._dependency_analyzer = SqlGlotDependencyAnalyzer()
        self._security_scanner = RegexSecurityScanner()
        self._flow_builder = HybridFlowBuilder()
        self._doc_generator = AutoDocGenerator()

        # Parser registry: maps dialect name → ISqlParser implementation
        self._parser_registry: dict[str, ISqlParser] = {
            "tsql": self._tsql_parser,
            "sqlserver": self._tsql_parser,
            "plpgsql": self._plpgsql_parser,
            "postgres": self._plpgsql_parser,
            "postgresql": self._plpgsql_parser,
            "plsql": self._plsql_parser,
            "oracle": self._plsql_parser,
        }

    @functools.cached_property
    def parse_sql_use_case(self) -> ParseSqlUseCase:
        return ParseSqlUseCase(self._parser_registry)

    @functools.cached_property
    def batch_parse_use_case(self) -> BatchParseUseCase:
        return BatchParseUseCase(self._parser_registry)

    @functools.cached_property
    def analyze_sql_use_case(self) -> AnalyzeSqlUseCase:
        return AnalyzeSqlUseCase(
            dependency_analyzer=self._dependency_analyzer,
            security_scanner=self._security_scanner,
            flow_builder=self._flow_builder,
        )

    @property
    def security_scanner(self) -> RegexSecurityScanner:
        return self._security_scanner

    @property
    def supported_dialects(self) -> list[str]:
        return sorted(set(self._parser_registry.keys()))


# Singleton instance — created once, shared across the app
container = Container()
