"""Infrastructure: Enhanced auto-documentation generator.

Extracts SQL header comments (Author, Date, Description, tickets),
inline comments, and generates step-by-step logic documentation
from the flow tree.
"""

from __future__ import annotations

import re
from typing import TYPE_CHECKING, Any

from src.domain.services.doc_generator import IDocGenerator

if TYPE_CHECKING:
    from src.domain.entities.complexity import ComplexityMetrics
    from src.domain.entities.dependency import DependencyRef
    from src.domain.entities.flow_node import FlowNode
    from src.domain.entities.parameter import ParameterInfo
    from src.domain.entities.table_reference import TableRef

# ── Header comment patterns ──

_HEADER_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("author", re.compile(r"--\s*(?:Author|Autor|Criado\s*por)\s*:\s*<?(.+?)>?\s*$", re.IGNORECASE | re.MULTILINE)),
    ("createDate", re.compile(r"--\s*(?:Create[d]?\s*date|Fecha\s*de\s*creaci[oó]n|Data\s*de\s*cria[cç][aã]o)\s*:\s*<?(.+?)>?\s*$", re.IGNORECASE | re.MULTILINE)),
    ("updateDate", re.compile(r"--\s*(?:Update[d]?\s*date|Modify\s*date|Fecha\s*de\s*modificaci[oó]n|Data\s*de\s*modifica[cç][aã]o)\s*:\s*<?(.+?)>?\s*$", re.IGNORECASE | re.MULTILINE)),
    ("updateAuthor", re.compile(r"--\s*(?:Update[d]?\s*(?:by|author)|Modified\s*by|Modificado\s*por|Atualizado\s*por)\s*:\s*<?(.+?)>?\s*$", re.IGNORECASE | re.MULTILINE)),
    ("description", re.compile(r"--\s*(?:Description|Descripci[oó]n|Descri[cç][aã]o)\s*:\s*<?(.+?)>?\s*$", re.IGNORECASE | re.MULTILINE)),
    ("ticket", re.compile(r"--\s*(?:Gemini|Azure|Jira|Ticket|Issue|Story|Task|Bug)\s*:\s*<?(.+?)>?\s*$", re.IGNORECASE | re.MULTILINE)),
    ("version", re.compile(r"--\s*(?:Version|Versi[oó]n|Vers[aã]o|Ver)\s*:\s*<?(.+?)>?\s*$", re.IGNORECASE | re.MULTILINE)),
    ("purpose", re.compile(r"--\s*(?:Purpose|Prop[oó]sito|Objetivo)\s*:\s*<?(.+?)>?\s*$", re.IGNORECASE | re.MULTILINE)),
]

# Multi-line block comment description
_BLOCK_DESCRIPTION_PATTERN = re.compile(
    r"/\*\s*\n(.*?)\*/",
    re.DOTALL,
)

# ── Comment language detection ──

_LANG_INDICATORS: dict[str, list[re.Pattern[str]]] = {
    "es": [
        re.compile(r"\b(?:Fecha\s+de\s+creaci[oó]n|Modificado\s+por|Descripci[oó]n|Prop[oó]sito|Objetivo|Autor|Versi[oó]n|Fecha|Cambios|Creado\s+por|Actualizado)\b", re.IGNORECASE),
        re.compile(r"[áéíóúñ¿¡]"),
    ],
    "pt": [
        re.compile(r"\b(?:Data\s+de\s+cria[cç][aã]o|Modificado\s+por|Descri[cç][aã]o|Prop[oó]sito|Objetivo|Autor|Vers[aã]o|Altera[cç][oõ]es|Criado\s+por|Atualizado)\b", re.IGNORECASE),
        re.compile(r"[ãõçâêôà]"),
    ],
    "en": [
        re.compile(r"\b(?:Created?\s+(?:date|by)|Updated?\s+(?:date|by)|Modified\s+by|Description|Purpose|Author|Version|Changes|Changelog)\b", re.IGNORECASE),
    ],
}

# Inline comments associated with code
_INLINE_COMMENT_PATTERN = re.compile(
    r"^(.+?)\s*--\s*(.+)$",
    re.MULTILINE,
)


def _detect_comment_language(sql: str) -> str:
    """Detect the primary language of SQL comments (es, en, pt).

    Scans all comment lines and scores each language by indicator matches.
    Returns the ISO 639-1 code with the highest score, defaulting to 'en'.
    """
    # Extract only comment text
    comment_lines: list[str] = []
    for line in sql.split("\n"):
        stripped = line.strip()
        if stripped.startswith("--"):
            comment_lines.append(stripped)
    # Also extract block comment content
    for m in _BLOCK_DESCRIPTION_PATTERN.finditer(sql):
        comment_lines.append(m.group(1))

    comment_text = "\n".join(comment_lines)
    if not comment_text:
        return "en"

    scores: dict[str, int] = {"en": 0, "es": 0, "pt": 0}
    for lang, patterns in _LANG_INDICATORS.items():
        for pattern in patterns:
            scores[lang] += len(pattern.findall(comment_text))

    best = max(scores, key=lambda k: scores[k])
    return best if scores[best] > 0 else "en"


def _extract_header_metadata(sql: str) -> dict[str, Any]:
    """Extract structured metadata from SQL header comments."""
    metadata: dict[str, Any] = {}

    for key, pattern in _HEADER_PATTERNS:
        matches = pattern.findall(sql)
        if matches:
            if key in metadata and isinstance(metadata[key], list):
                metadata[key].extend(m.strip() for m in matches)
            elif key in metadata:
                metadata[key] = [metadata[key]] + [m.strip() for m in matches]
            elif len(matches) > 1:
                metadata[key] = [m.strip() for m in matches]
            else:
                metadata[key] = matches[0].strip()

    # Extract multi-line descriptions from block comments in the header
    # Only look at the first 50 lines for header comments
    header_section = "\n".join(sql.split("\n")[:50])
    block_matches = _BLOCK_DESCRIPTION_PATTERN.findall(header_section)
    if block_matches and "description" not in metadata:
        # Clean up block comment content
        desc_lines = []
        for line in block_matches[0].split("\n"):
            cleaned = line.strip().lstrip("*").strip()
            if cleaned and not any(cleaned.upper().startswith(kw) for kw in
                                   ("AUTHOR", "DATE", "CREATE", "UPDATE", "VERSION", "GEMINI", "AZURE")):
                desc_lines.append(cleaned)
        if desc_lines:
            metadata["description"] = " ".join(desc_lines)

    # Extract change history entries
    change_pattern = re.compile(
        r"--\s*(?:Author|Modified)\s*:\s*<?(.+?)>?\s*\n"
        r"--\s*(?:Update[d]?\s*date|Date)\s*:\s*<?(.+?)>?\s*\n"
        r"--\s*Description\s*:\s*<?(.+?)>?\s*$",
        re.IGNORECASE | re.MULTILINE,
    )
    changes = []
    for m in change_pattern.finditer(sql):
        changes.append({
            "author": m.group(1).strip(),
            "date": m.group(2).strip(),
            "description": m.group(3).strip(),
        })
    if changes:
        metadata["changeHistory"] = changes

    return metadata


def _extract_inline_comments(sql: str) -> dict[int, str]:
    """Extract inline comments mapped to line numbers."""
    comments: dict[int, str] = {}
    for i, line in enumerate(sql.split("\n"), 1):
        stripped = line.strip()
        # Full-line comments (not header)
        if stripped.startswith("--") and not any(
            stripped.upper().lstrip("-").strip().startswith(kw)
            for kw in ("AUTHOR", "AUTOR", "CREATE", "CRIADO", "UPDATE", "ATUALIZADO",
                        "DESCRIPTION", "DESCRIPCI", "DESCRI", "GEMINI",
                        "AZURE", "JIRA", "VERSION", "VERSI", "VERS",
                        "PURPOSE", "PROP", "OBJETIVO", "=====", "-----")
        ):
            comment_text = stripped.lstrip("-").strip()
            if comment_text and len(comment_text) > 2:
                comments[i] = comment_text
        # Inline comments after code
        elif "--" in stripped and not stripped.startswith("--"):
            m = _INLINE_COMMENT_PATTERN.match(stripped)
            if m:
                comments[i] = m.group(2).strip()
    return comments


def _generate_process_steps(
    flow_tree: FlowNode | None,
    inline_comments: dict[int, str],
    sql: str,
) -> list[dict[str, Any]]:
    """Generate business-oriented process documentation.

    Groups operations into logical sections using SQL comments as headers,
    describes business intent rather than SQL syntax.
    """
    if not flow_tree:
        return []

    # Build sections: group consecutive nodes by preceding comments
    sections: list[dict[str, Any]] = []
    _build_sections(flow_tree.children, sections, inline_comments, step_counter=[0])
    return sections


def _build_sections(
    nodes: list[FlowNode],
    sections: list[dict[str, Any]],
    comments: dict[int, str],
    step_counter: list[int],
    used_comments: set[int] | None = None,
) -> None:
    """Walk flow nodes and group them into business-oriented sections."""
    if used_comments is None:
        used_comments = set()

    for node in nodes:
        if node.node_type in ("start", "end", "branch"):
            _build_sections(node.children, sections, comments, step_counter, used_comments)
            continue

        step_counter[0] += 1

        # Check for a comment above this node → use as section context
        section_comment = None
        comment_line = None
        if node.line_number:
            for offset in range(1, 4):  # Check up to 3 lines above
                line_key = node.line_number - offset
                if line_key in comments and line_key not in used_comments:
                    section_comment = comments[line_key]
                    comment_line = line_key
                    break

        # Mark comment as used to prevent duplication
        if comment_line is not None:
            used_comments.add(comment_line)

        section = _build_business_step(node, step_counter[0], section_comment, comments, step_counter, used_comments)
        sections.append(section)


def _build_business_step(
    node: FlowNode,
    step_num: int,
    context_comment: str | None,
    comments: dict[int, str],
    step_counter: list[int],
    used_comments: set[int] | None = None,
) -> dict[str, Any]:
    """Build a single business-oriented step from a flow node."""
    if used_comments is None:
        used_comments = set()

    op = (node.operation or "").upper()

    # Compute line range from snippet
    line_end = None
    if node.line_number and node.sql_snippet:
        line_end = node.line_number + node.sql_snippet.count("\n")

    step: dict[str, Any] = {
        "step": step_num,
        "line": node.line_number,
        "lineEnd": line_end,
        "type": _classify_business_type(node),
        "title": _generate_business_title(node, context_comment),
        "detail": _generate_business_detail(node),
    }

    if context_comment:
        step["businessContext"] = context_comment

    # Data impact
    if node.affected_tables:
        step["dataImpact"] = {
            "tables": node.affected_tables,
            "operation": op,
        }
    if node.target_procedure:
        step["calls"] = node.target_procedure
    if node.variables_written:
        step["outputs"] = node.variables_written
    if node.variables_read:
        step["inputs"] = node.variables_read
    if node.sql_snippet:
        step["sql"] = node.sql_snippet

    # Condition branches → sub-steps
    if node.node_type == "condition":
        step["condition"] = node.expression or node.condition or node.label
        if node.true_branch and node.true_branch.children:
            then_steps: list[dict[str, Any]] = []
            _build_sections(node.true_branch.children, then_steps, comments, step_counter, used_comments)
            if then_steps:
                step["whenTrue"] = then_steps
        if node.false_branch and node.false_branch.children:
            else_steps: list[dict[str, Any]] = []
            _build_sections(node.false_branch.children, else_steps, comments, step_counter, used_comments)
            if else_steps:
                step["whenFalse"] = else_steps

    # Loop body
    if node.node_type == "loop" and node.children:
        body_steps: list[dict[str, Any]] = []
        _build_sections(node.children, body_steps, comments, step_counter, used_comments)
        if body_steps:
            step["repeats"] = body_steps

    # TRY/CATCH
    if node.node_type == "error_handler" and op == "TRY":
        if node.true_branch and node.true_branch.children:
            try_steps: list[dict[str, Any]] = []
            _build_sections(node.true_branch.children, try_steps, comments, step_counter, used_comments)
            if try_steps:
                step["protectedSteps"] = try_steps
        if node.false_branch and node.false_branch.children:
            catch_steps: list[dict[str, Any]] = []
            _build_sections(node.false_branch.children, catch_steps, comments, step_counter, used_comments)
            if catch_steps:
                step["errorHandling"] = catch_steps

    return step


def _classify_business_type(node: FlowNode) -> str:
    """Classify a node into a business-oriented category (English keys for i18n)."""
    op = (node.operation or "").upper()
    if op in ("DECLARE", "SET"):
        return "setup"
    if op == "SELECT":
        return "query"
    if op in ("INSERT", "UPDATE", "DELETE", "MERGE", "TRUNCATE"):
        return "modify"
    if op == "EXEC":
        return "call"
    if op in ("IF", "ELSE IF"):
        return "decision"
    if op in ("WHILE", "FOR"):
        return "loop"
    if op == "TRY":
        return "protection"
    if op in ("RAISERROR", "THROW"):
        return "error"
    if op == "RETURN":
        return "result"
    if op in ("BEGIN TRANSACTION", "COMMIT", "ROLLBACK"):
        return "transaction"
    return "operation"


def _generate_business_title(node: FlowNode, context: str | None) -> str:
    """Generate a business-friendly title for a step.

    Uses the SQL comment context when available to describe business intent.
    Falls back to a data-driven description (language-neutral with identifiers).
    """
    if context and len(context) > 5:
        return context

    op = (node.operation or "").upper()

    if op == "DECLARE":
        vars_str = ", ".join(node.variables_written) if node.variables_written else ""
        return f"DECLARE {vars_str}" if vars_str else "DECLARE"
    if op == "SET":
        var = node.variables_written[0] if node.variables_written else ""
        expr = node.expression or ""
        return f"SET {var} = {expr[:60]}" if var else "SET"
    if op == "SELECT":
        if node.variables_written:
            tables = ", ".join(node.affected_tables) if node.affected_tables else ""
            return f"{', '.join(node.variables_written)} ← {tables}" if tables else f"{', '.join(node.variables_written)}"
        return ", ".join(node.affected_tables) if node.affected_tables else "SELECT"
    if op == "INSERT":
        return f"INSERT → {', '.join(node.affected_tables)}" if node.affected_tables else "INSERT"
    if op == "UPDATE":
        return f"UPDATE → {', '.join(node.affected_tables)}" if node.affected_tables else "UPDATE"
    if op == "DELETE":
        return f"DELETE → {', '.join(node.affected_tables)}" if node.affected_tables else "DELETE"
    if op == "MERGE":
        return f"MERGE → {', '.join(node.affected_tables)}" if node.affected_tables else "MERGE"
    if op == "EXEC":
        return node.target_procedure or "EXEC"
    if op in ("IF", "ELSE IF"):
        cond = node.expression or node.condition or ""
        return cond[:100] if cond else "IF"
    if op in ("WHILE", "FOR"):
        cond = node.expression or node.condition or ""
        return cond[:80] if cond else op
    if op == "TRY":
        return "TRY / CATCH"
    if op in ("RAISERROR", "THROW"):
        return op
    if op == "RETURN":
        vars_str = ", ".join(node.variables_read) if node.variables_read else ""
        return f"RETURN {vars_str}" if vars_str else "RETURN"
    if op in ("BEGIN TRANSACTION", "COMMIT", "ROLLBACK"):
        return op
    if op == "TRUNCATE":
        return f"TRUNCATE {', '.join(node.affected_tables)}" if node.affected_tables else "TRUNCATE"

    return node.label[:80] if node.label else ""


def _generate_business_detail(node: FlowNode) -> str | None:
    """Generate detail string with table/variable info (language-neutral, uses identifiers)."""
    op = (node.operation or "").upper()

    if op == "SELECT" and node.variables_written and node.affected_tables:
        return f"{', '.join(node.variables_written)} FROM {', '.join(node.affected_tables)}"

    if op == "INSERT" and node.affected_tables and node.variables_read:
        return f"({', '.join(node.variables_read[:5])}) → {', '.join(node.affected_tables)}"

    if op == "UPDATE" and node.affected_tables and node.variables_read:
        return f"{', '.join(node.affected_tables)} WHERE {', '.join(node.variables_read[:3])}"

    if op == "DELETE" and node.affected_tables and node.variables_read:
        return f"{', '.join(node.affected_tables)} WHERE {', '.join(node.variables_read[:3])}"

    if op == "EXEC" and node.target_procedure and node.variables_read:
        return f"({', '.join(node.variables_read[:5])})"

    return None


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

    def generate_enhanced(
        self,
        name: str,
        parameters: list[ParameterInfo],
        table_refs: list[TableRef],
        dependencies: list[DependencyRef],
        complexity: ComplexityMetrics | None,
        return_type: str | None,
        raw_sql: str | None = None,
        flow_tree: FlowNode | None = None,
    ) -> dict[str, Any]:
        """Generate enhanced documentation with header metadata, inline comments, and step-by-step logic."""
        # Start with base doc
        base = self.generate(name, parameters, table_refs, dependencies, complexity, return_type)

        if not raw_sql:
            return base

        # Detect comment language
        base["commentLanguage"] = _detect_comment_language(raw_sql)

        # Extract header metadata from SQL comments
        header = _extract_header_metadata(raw_sql)
        if header:
            base["header"] = header
            # Override summary with description from comments if available
            if "description" in header:
                desc = header["description"]
                if isinstance(desc, list):
                    desc = desc[0]
                base["summary"] = desc

        # Extract inline comments
        inline_comments = _extract_inline_comments(raw_sql)

        # Generate business-oriented process documentation from flow tree
        steps = _generate_process_steps(flow_tree, inline_comments, raw_sql)
        if steps:
            base["steps"] = steps

        # Generate process summary from flow tree
        if flow_tree:
            base["processOverview"] = _generate_process_overview(
                flow_tree, table_refs, dependencies, parameters,
            )

        return base


def _generate_process_overview(
    flow_tree: FlowNode,
    table_refs: list[TableRef],
    dependencies: list[DependencyRef],
    parameters: list[ParameterInfo],
) -> dict[str, Any]:
    """Generate a high-level overview of the procedure's process."""
    overview: dict[str, Any] = {}

    # Input/Output analysis
    in_params = [p for p in parameters if p.mode in ("IN", "INOUT")]
    out_params = [p for p in parameters if p.mode in ("OUT", "INOUT")]
    overview["inputs"] = [
        {"name": p.name, "type": p.data_type, "default": p.default_value}
        for p in in_params
    ]
    overview["outputs"] = [
        {"name": p.name, "type": p.data_type}
        for p in out_params
    ]

    # Data flow: which tables are read vs written
    reads = list({r.full_name for r in table_refs if r.is_read_operation()})
    writes = list({r.full_name for r in table_refs if r.is_write_operation()})
    overview["dataFlow"] = {
        "reads": sorted(reads),
        "writes": sorted(writes),
    }

    # External calls
    calls = [d.target_name for d in dependencies if d.is_call()]
    if calls:
        overview["externalCalls"] = calls

    # Count flow structure
    conditions = 0
    loops = 0
    try_catches = 0
    for node in flow_tree.flatten():
        if node.node_type == "condition":
            conditions += 1
        elif node.node_type == "loop":
            loops += 1
        elif node.node_type == "error_handler" and node.operation == "TRY":
            try_catches += 1

    overview["structure"] = {
        "conditions": conditions,
        "loops": loops,
        "tryCatches": try_catches,
    }

    return overview
