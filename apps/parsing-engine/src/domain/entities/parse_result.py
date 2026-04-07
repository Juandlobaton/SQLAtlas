"""Pure domain entity: Complete result of parsing a SQL object."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from src.domain.entities.complexity import ComplexityMetrics
    from src.domain.entities.dependency import DependencyRef
    from src.domain.entities.flow_node import FlowNode
    from src.domain.entities.parameter import ParameterInfo
    from src.domain.entities.security_finding import SecurityFinding
    from src.domain.entities.table_reference import TableRef
    from src.domain.entities.variable_reference import VariableReference
    from src.domain.value_objects.object_type import ObjectType
    from src.domain.value_objects.sql_hash import SqlHash


@dataclass
class ParseResult:
    object_name: str
    object_type: ObjectType
    schema_name: str
    full_qualified_name: str
    raw_definition: str
    definition_hash: SqlHash
    language: str
    parameters: list[ParameterInfo]
    return_type: str | None
    dependencies: list[DependencyRef]
    table_references: list[TableRef]
    security_findings: list[SecurityFinding]
    flow_tree: FlowNode | None
    line_count: int
    complexity: ComplexityMetrics | None
    auto_doc: dict[str, Any] | None
    variable_references: list[VariableReference] | None = None

    @property
    def has_security_issues(self) -> bool:
        return any(f.is_critical() for f in self.security_findings)

    @property
    def call_dependencies(self) -> list[DependencyRef]:
        return [d for d in self.dependencies if d.is_call()]

    @property
    def write_tables(self) -> list[TableRef]:
        return [t for t in self.table_references if t.is_write_operation()]

    @property
    def read_tables(self) -> list[TableRef]:
        return [t for t in self.table_references if t.is_read_operation()]

    def to_dict(self) -> dict[str, Any]:
        return {
            "objectName": self.object_name,
            "objectType": self.object_type.value,
            "schemaName": self.schema_name,
            "fullQualifiedName": self.full_qualified_name,
            "definitionHash": str(self.definition_hash),
            "language": self.language,
            "parameters": [
                {
                    "name": p.name,
                    "dataType": p.data_type,
                    "mode": p.mode,
                    "defaultValue": p.default_value,
                    "ordinalPosition": p.ordinal_position,
                }
                for p in self.parameters
            ],
            "returnType": self.return_type,
            "dependencies": [
                {
                    "targetName": d.target_name,
                    "dependencyType": d.dependency_type,
                    "lineNumber": d.line_number,
                    "isDynamic": d.is_dynamic,
                    "confidence": d.confidence,
                    "snippet": d.snippet,
                }
                for d in self.dependencies
            ],
            "tableReferences": [
                {
                    "tableName": t.table_name,
                    "fullName": t.full_name,
                    "operation": t.operation,
                    "schemaName": t.schema_name,
                    "isTempTable": t.is_temp_table,
                }
                for t in self.table_references
            ],
            "securityFindings": [
                {
                    "severity": f.severity.value,
                    "findingType": f.finding_type,
                    "message": f.message,
                    "line": f.line,
                    "recommendation": f.recommendation,
                }
                for f in self.security_findings
            ],
            "flowTree": self.flow_tree.to_dict() if self.flow_tree else None,
            "lineCount": self.line_count,
            "complexity": self.complexity.to_dict() if self.complexity else None,
            "autoDoc": self.auto_doc,
            "variableReferences": (
                [v.to_dict() for v in self.variable_references]
                if self.variable_references else []
            ),
        }
