"""Use Case: Batch parse multiple SQL objects."""

from __future__ import annotations

from typing import TYPE_CHECKING

import structlog

from src.application.dto.parse_dto import BatchParseInput, BatchParseOutput
from src.application.use_cases.parse_sql import ParseSqlUseCase

if TYPE_CHECKING:
    from src.domain.services.sql_parser import ISqlParser

logger = structlog.get_logger(__name__)


class BatchParseUseCase:
    def __init__(self, parser_registry: dict[str, ISqlParser]) -> None:
        self._parse_use_case = ParseSqlUseCase(parser_registry)

    def execute(self, input_dto: BatchParseInput) -> BatchParseOutput:
        results = []
        total_errors = 0

        for item in input_dto.items:
            output = self._parse_use_case.execute(item)
            results.append(output)
            if not output.success:
                total_errors += 1

        return BatchParseOutput(
            success=total_errors == 0,
            results=results,
            total_processed=len(input_dto.items),
            total_errors=total_errors,
        )
