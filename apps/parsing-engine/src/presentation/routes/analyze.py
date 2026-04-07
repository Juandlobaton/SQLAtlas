"""Presentation: Analysis endpoints."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from starlette.requests import Request  # noqa: TC002

from src.application.dto.parse_dto import AnalyzeInput
from src.infrastructure.web.container import container
from src.infrastructure.web.rate_limit import limiter
from src.presentation.schemas.api_schemas import AnalyzeRequestSchema, AnalyzeResponseSchema

router = APIRouter()


@router.post("/analyze", response_model=AnalyzeResponseSchema)
@limiter.limit("20/minute")
def analyze_sql(request: Request, body: AnalyzeRequestSchema) -> dict[str, Any]:  # noqa: ARG001
    input_dto = AnalyzeInput(
        sql=body.sql,
        dialect=body.dialect,
        analysis_types=list(body.analysis_types),
    )

    output = container.analyze_sql_use_case.execute(input_dto)

    return {
        "success": output.success,
        "data": {
            "dependencies": output.dependencies,
            "tableReferences": output.table_references,
            "securityFindings": output.security_findings,
            "complexity": output.complexity,
            "flowTree": output.flow_tree,
        },
        "errors": output.errors,
    }


@router.get("/security/rules/{dialect}")
def get_security_rules(dialect: str) -> dict[str, Any]:
    rules = container.security_scanner.get_rules(dialect)
    return {"dialect": dialect, "rules": rules}
