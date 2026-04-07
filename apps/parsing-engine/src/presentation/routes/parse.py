"""Presentation: Parse endpoints.

Controllers are thin — they validate input, call the use case, and return output.
No business logic lives here.
"""

from __future__ import annotations

import threading
from typing import Any

from fastapi import APIRouter
from starlette.requests import Request  # noqa: TC002

from src.application.dto.parse_dto import BatchParseInput, ParseInput
from src.config import settings
from src.infrastructure.web.container import container
from src.infrastructure.web.rate_limit import limiter
from src.presentation.schemas.api_schemas import (
    BatchParseRequestSchema,
    BatchParseResponseSchema,
    ParseRequestSchema,
    ParseResponseSchema,
)

router = APIRouter()

_parse_lock = threading.Semaphore(settings.max_concurrent_parses)


@router.post("/parse", response_model=ParseResponseSchema)
@limiter.limit("30/minute")
def parse_sql(request: Request, body: ParseRequestSchema) -> dict[str, Any]:  # noqa: ARG001
    input_dto = ParseInput(
        sql=body.sql,
        dialect=body.dialect,
        extract_dependencies=body.extract_dependencies,
        analyze_flow=body.analyze_flow,
        analyze_complexity=body.analyze_complexity,
        analyze_security=body.analyze_security,
        generate_docs=body.generate_docs,
    )

    with _parse_lock:
        # TODO: add per-request timeout for CPU-bound parsing
        output = container.parse_sql_use_case.execute(input_dto)

    return {
        "success": output.success,
        "data": output.results,
        "errors": output.errors,
        "metadata": output.metadata,
    }


@router.post("/parse/batch", response_model=BatchParseResponseSchema)
@limiter.limit("200/minute")
def batch_parse(request: Request, body: BatchParseRequestSchema) -> dict[str, Any]:  # noqa: ARG001
    items = [
        ParseInput(sql=item.sql, dialect=item.dialect)
        for item in body.items
    ]
    input_dto = BatchParseInput(items=items, correlation_id=body.correlation_id)

    with _parse_lock:
        # TODO: add per-request timeout for CPU-bound parsing
        output = container.batch_parse_use_case.execute(input_dto)

    return {
        "success": output.success,
        "total_processed": output.total_processed,
        "total_errors": output.total_errors,
        "results": [
            {
                "success": r.success,
                "data": r.results,
                "errors": r.errors,
                "metadata": r.metadata,
            }
            for r in output.results
        ],
    }


@router.get("/dialects")
def list_dialects() -> dict[str, Any]:
    return {"dialects": container.supported_dialects}
