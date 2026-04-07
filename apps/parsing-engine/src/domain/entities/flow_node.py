"""Pure domain entity: Execution flow tree node."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class FlowNode:
    node_id: str
    node_type: str  # start, end, statement, condition, loop, call, return, error_handler
    label: str
    line_number: int | None = None
    children: list[FlowNode] = field(default_factory=list)
    condition: str | None = None
    true_branch: FlowNode | None = None
    false_branch: FlowNode | None = None

    def is_branching(self) -> bool:
        return self.node_type in ("condition", "loop")

    def is_terminal(self) -> bool:
        return self.node_type in ("end", "return", "error_handler")

    def depth(self, _current: int = 0, max_depth: int = 100) -> int:
        if _current >= max_depth:
            return _current
        if not self.children:
            return _current
        return max(child.depth(_current + 1, max_depth) for child in self.children)

    def flatten(self, _depth: int = 0, max_depth: int = 100) -> list[FlowNode]:
        """Return all nodes in a flat list (pre-order traversal)."""
        if _depth >= max_depth:
            return [self]
        result = [self]
        for child in self.children:
            result.extend(child.flatten(_depth + 1, max_depth))
        if self.true_branch:
            result.extend(self.true_branch.flatten(_depth + 1, max_depth))
        if self.false_branch:
            result.extend(self.false_branch.flatten(_depth + 1, max_depth))
        return result

    def to_dict(self) -> dict[str, Any]:
        return {
            "nodeId": self.node_id,
            "nodeType": self.node_type,
            "label": self.label,
            "lineNumber": self.line_number,
            "condition": self.condition,
            "children": [c.to_dict() for c in self.children],
            "trueBranch": self.true_branch.to_dict() if self.true_branch else None,
            "falseBranch": self.false_branch.to_dict() if self.false_branch else None,
        }
