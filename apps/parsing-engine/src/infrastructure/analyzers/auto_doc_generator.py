"""Infrastructure: Auto-documentation generator."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from src.domain.services.doc_generator import IDocGenerator

if TYPE_CHECKING:
    from src.domain.entities.complexity import ComplexityMetrics
    from src.domain.entities.dependency import DependencyRef
    from src.domain.entities.parameter import ParameterInfo
    from src.domain.entities.table_reference import TableRef


class AutoDocGenerator(IDocGenerator):
    def generate(
        self,
        name: str,
        parameters: list[ParameterInfo],
        table_refs: list[TableRef],
        dependencies: list[DependencyRef],
        complexity: ComplexityMetrics | None,
        return_type: str | None,
    ) -> dict[str, Any]:
        tables_accessed = [
            {"tableName": r.full_name, "operation": r.operation}
            for r in table_refs
        ]

        side_effects = [
            f"{r.operation} on {r.full_name}" for r in table_refs if r.is_write_operation()
        ]

        called_procs = [d.target_name for d in dependencies if d.is_call() and not d.is_dynamic]
        if called_procs:
            side_effects.append(f"Calls: {', '.join(called_procs)}")

        param_docs = {
            p.name: f"({p.mode}) {p.data_type}"
            + (f" = {p.default_value}" if p.has_default() else "")
            for p in parameters
        }

        read_tables = [r.full_name for r in table_refs if r.is_read_operation()]
        write_tables = [r.full_name for r in table_refs if r.is_write_operation()]

        summary_parts = [f"{'Function' if return_type else 'Procedure'} {name}"]
        if read_tables:
            summary_parts.append(f"reads from {', '.join(read_tables[:3])}")
        if write_tables:
            summary_parts.append(f"writes to {', '.join(write_tables[:3])}")

        return {
            "summary": ". ".join(summary_parts),
            "description": (
                f"{'Function' if return_type else 'Procedure'} with {len(parameters)} parameters, "
                f"accessing {len(table_refs)} tables, "
                f"calling {len(called_procs)} other procedures."
            ),
            "parameterDocs": param_docs,
            "returns": return_type,
            "sideEffects": side_effects,
            "tablesAccessed": tables_accessed,
            "complexity": complexity.to_dict() if complexity else None,
        }
