"""Unit tests for domain entities — pure, no framework needed."""

from src.domain.entities.complexity import ComplexityMetrics
from src.domain.entities.dependency import DependencyRef
from src.domain.entities.flow_node import FlowNode
from src.domain.entities.parameter import ParameterInfo
from src.domain.entities.security_finding import SecurityFinding
from src.domain.entities.table_reference import TableRef
from src.domain.value_objects.severity import Severity


class TestParameterInfo:
    def test_is_output(self):
        p = ParameterInfo(name="@id", data_type="INT", mode="OUT")
        assert p.is_output()

    def test_is_not_output(self):
        p = ParameterInfo(name="@id", data_type="INT", mode="IN")
        assert not p.is_output()

    def test_has_default(self):
        p = ParameterInfo(name="@x", data_type="INT", default_value="0")
        assert p.has_default()


class TestDependencyRef:
    def test_is_reliable(self):
        d = DependencyRef(target_name="sp_foo", dependency_type="calls", confidence=0.9)
        assert d.is_reliable()

    def test_dynamic_is_not_reliable(self):
        d = DependencyRef(
            target_name="<dynamic>", dependency_type="calls",
            is_dynamic=True, confidence=0.5,
        )
        assert not d.is_reliable()

    def test_is_call(self):
        d = DependencyRef(target_name="sp_foo", dependency_type="calls")
        assert d.is_call()
        d2 = DependencyRef(target_name="t", dependency_type="reads_from")
        assert not d2.is_call()


class TestTableRef:
    def test_write_operation(self):
        t = TableRef(table_name="users", full_name="dbo.users", operation="INSERT")
        assert t.is_write_operation()
        assert not t.is_read_operation()

    def test_read_operation(self):
        t = TableRef(table_name="users", full_name="dbo.users", operation="SELECT")
        assert t.is_read_operation()


class TestComplexityMetrics:
    def test_risk_levels(self):
        assert ComplexityMetrics(cyclomatic_complexity=3).risk_level == "low"
        assert ComplexityMetrics(cyclomatic_complexity=8).risk_level == "moderate"
        assert ComplexityMetrics(cyclomatic_complexity=15).risk_level == "high"
        assert ComplexityMetrics(cyclomatic_complexity=25).risk_level == "critical"

    def test_to_dict(self):
        m = ComplexityMetrics(cyclomatic_complexity=5, nesting_depth=2)
        d = m.to_dict()
        assert d["cyclomaticComplexity"] == 5
        assert d["riskLevel"] == "low"


class TestSecurityFinding:
    def test_is_critical(self):
        f = SecurityFinding(severity=Severity.CRITICAL, finding_type="x", message="y")
        assert f.is_critical()

    def test_not_critical(self):
        f = SecurityFinding(severity=Severity.LOW, finding_type="x", message="y")
        assert not f.is_critical()


class TestFlowNode:
    def test_depth(self):
        leaf = FlowNode(node_id="1", node_type="end", label="End")
        root = FlowNode(node_id="0", node_type="start", label="Start", children=[leaf])
        assert root.depth() == 1

    def test_flatten(self):
        child = FlowNode(node_id="1", node_type="statement", label="X")
        root = FlowNode(node_id="0", node_type="start", label="Start", children=[child])
        flat = root.flatten()
        assert len(flat) == 2

    def test_to_dict(self):
        node = FlowNode(node_id="1", node_type="start", label="Start")
        d = node.to_dict()
        assert d["nodeId"] == "1"
        assert d["nodeType"] == "start"
