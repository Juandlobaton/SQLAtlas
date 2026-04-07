"""Use Case: Parse SQL source code.

Orchestrates the parsing pipeline using domain service contracts.
This use case knows NOTHING about SQLGlot, FastAPI, or any framework.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import structlog

from src.application.dto.parse_dto import ParseInput, ParseOutput

if TYPE_CHECKING:
    from src.domain.services.sql_parser import ISqlParser

logger = structlog.get_logger(__name__)


class ParseSqlUseCase:
    def __init__(self, parser_registry: dict[str, ISqlParser]) -> None:
        self._parsers = parser_registry

    def execute(self, input_dto: ParseInput) -> ParseOutput:
        dialect = input_dto.dialect.lower()
        parser = self._parsers.get(dialect)

        if not parser:
            supported = ", ".join(self._parsers.keys())
            return ParseOutput(
                success=False,
                results=[],
                errors=[f"Unsupported dialect '{dialect}'. Supported: {supported}"],
            )

        if not input_dto.sql.strip():
            return ParseOutput(
                success=False,
                results=[],
                errors=["SQL input cannot be empty"],
            )

        try:
            parse_results = parser.parse(input_dto.sql)
        except Exception as e:
            logger.error("Parse error for dialect %s: %s", dialect, e, exc_info=True)
            return ParseOutput(
                success=False,
                results=[],
                errors=["Parse error: an internal error occurred"],
            )

        results_dicts = [r.to_dict() for r in parse_results]

        return ParseOutput(
            success=True,
            results=results_dicts,
            metadata={
                "dialect": dialect,
                "objectCount": len(parse_results),
                "totalDependencies": sum(len(r.dependencies) for r in parse_results),
                "totalSecurityFindings": sum(len(r.security_findings) for r in parse_results),
                "hasSecurityIssues": any(r.has_security_issues for r in parse_results),
            },
        )
