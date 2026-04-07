"""Presentation layer: Pydantic schemas for API validation.

These schemas live in presentation because they are HTTP-specific.
They translate between HTTP requests and Application DTOs.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

DialectType = Literal["tsql", "plpgsql", "postgres", "postgresql", "plsql", "oracle", "sqlserver"]


class ParseRequestSchema(BaseModel):
    sql: str = Field(..., min_length=1, max_length=500_000, description="SQL source code")
    dialect: DialectType = Field(
        ..., description="SQL dialect: tsql, plpgsql, plsql, postgres, oracle, sqlserver"
    )
    extract_dependencies: bool = Field(True, alias="extractDependencies")
    analyze_flow: bool = Field(True, alias="analyzeFlow")
    analyze_complexity: bool = Field(True, alias="analyzeComplexity")
    analyze_security: bool = Field(True, alias="analyzeSecurity")
    generate_docs: bool = Field(True, alias="generateDocs")

    model_config = {"populate_by_name": True}


class BatchParseItemSchema(BaseModel):
    sql: str = Field(..., min_length=1, max_length=500_000)
    dialect: DialectType


class BatchParseRequestSchema(BaseModel):
    items: list[BatchParseItemSchema] = Field(..., max_length=200)
    correlation_id: str | None = Field(None, alias="correlationId")

    model_config = {"populate_by_name": True}


class AnalyzeRequestSchema(BaseModel):
    sql: str = Field(..., min_length=1, max_length=500_000)
    dialect: DialectType
    analysis_types: list[Literal["dependencies", "security", "complexity", "flow"]] = Field(
        default=["dependencies", "security", "complexity", "flow"],
        alias="analysisTypes",
    )

    model_config = {"populate_by_name": True}


class SecurityRulesRequestSchema(BaseModel):
    dialect: DialectType


class ParseResponseSchema(BaseModel):
    success: bool
    data: list[dict[str, Any]] = []
    errors: list[str] = []
    metadata: dict[str, Any] = {}


class BatchParseResponseSchema(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    success: bool
    total_processed: int = Field(0, alias="totalProcessed")
    total_errors: int = Field(0, alias="totalErrors")
    results: list[ParseResponseSchema] = []


class AnalyzeResponseSchema(BaseModel):
    success: bool
    data: dict[str, Any] = {}
    errors: list[str] = []
