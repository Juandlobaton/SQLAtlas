"""Use Case: Analyze SQL for dependencies, security, flow, and complexity.

Provides granular analysis without full parsing — useful when the caller
already has parsed objects and needs specific analysis.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

import structlog

from src.application.dto.parse_dto import AnalyzeInput, AnalyzeOutput

if TYPE_CHECKING:
    from src.domain.services.dependency_analyzer import IDependencyAnalyzer
    from src.domain.services.flow_builder import IFlowBuilder
    from src.domain.services.security_scanner import ISecurityScanner

logger = structlog.get_logger(__name__)


class AnalyzeSqlUseCase:
    def __init__(
        self,
        dependency_analyzer: IDependencyAnalyzer,
        security_scanner: ISecurityScanner,
        flow_builder: IFlowBuilder,
    ) -> None:
        self._deps = dependency_analyzer
        self._security = security_scanner
        self._flow = flow_builder

    def execute(self, input_dto: AnalyzeInput) -> AnalyzeOutput:
        errors: list[str] = []
        dependencies: list[dict[str, Any]] = []
        table_refs: list[dict[str, Any]] = []
        security_findings: list[dict[str, Any]] = []
        complexity: dict[str, Any] | None = None
        flow_tree: dict[str, Any] | None = None

        dialect = input_dto.dialect.lower()

        if "dependencies" in input_dto.analysis_types:
            try:
                deps = self._deps.extract_call_dependencies(input_dto.sql, dialect)
                dependencies = [
                    {
                        "targetName": d.target_name,
                        "dependencyType": d.dependency_type,
                        "lineNumber": d.line_number,
                        "isDynamic": d.is_dynamic,
                        "confidence": d.confidence,
                    }
                    for d in deps
                ]

                tables = self._deps.extract_table_references(input_dto.sql, dialect)
                table_refs = [
                    {
                        "tableName": t.table_name,
                        "fullName": t.full_name,
                        "operation": t.operation,
                        "isTempTable": t.is_temp_table,
                    }
                    for t in tables
                ]
            except Exception as e:
                logger.error("Dependency analysis failed: %s", e, exc_info=True)
                errors.append("Dependency analysis failed")

        if "security" in input_dto.analysis_types:
            try:
                findings = self._security.scan(input_dto.sql, dialect)
                security_findings = [
                    {
                        "severity": f.severity.value,
                        "findingType": f.finding_type,
                        "message": f.message,
                        "line": f.line,
                        "recommendation": f.recommendation,
                    }
                    for f in findings
                ]
            except Exception as e:
                logger.error("Security scan failed: %s", e, exc_info=True)
                errors.append("Security scan failed")

        if "complexity" in input_dto.analysis_types:
            try:
                metrics = self._flow.calculate_complexity(input_dto.sql, dialect)
                complexity = metrics.to_dict()
            except Exception as e:
                logger.error("Complexity analysis failed: %s", e, exc_info=True)
                errors.append("Complexity analysis failed")

        if "flow" in input_dto.analysis_types:
            try:
                tree = self._flow.build_flow_tree(input_dto.sql, dialect)
                flow_tree = tree.to_dict()
            except Exception as e:
                logger.error("Flow analysis failed: %s", e, exc_info=True)
                errors.append("Flow analysis failed")

        return AnalyzeOutput(
            success=len(errors) == 0,
            dependencies=dependencies,
            table_references=table_refs,
            security_findings=security_findings,
            complexity=complexity,
            flow_tree=flow_tree,
            errors=errors,
        )
