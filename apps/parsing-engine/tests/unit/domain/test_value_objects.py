"""Unit tests for domain value objects — pure, no framework needed."""

import pytest

from src.domain.value_objects.object_type import ObjectType
from src.domain.value_objects.severity import Severity
from src.domain.value_objects.sql_hash import SqlHash


class TestSqlHash:
    def test_from_sql_produces_64_char_hex(self):
        h = SqlHash.from_sql("SELECT 1")
        assert len(str(h)) == 64

    def test_same_sql_produces_same_hash(self):
        h1 = SqlHash.from_sql("SELECT 1")
        h2 = SqlHash.from_sql("SELECT 1")
        assert h1 == h2

    def test_different_sql_produces_different_hash(self):
        h1 = SqlHash.from_sql("SELECT 1")
        h2 = SqlHash.from_sql("SELECT 2")
        assert h1 != h2

    def test_invalid_length_raises(self):
        with pytest.raises(ValueError, match="SqlHash must be 64 hex characters"):
            SqlHash("abc")

    def test_repr(self):
        h = SqlHash.from_sql("SELECT 1")
        assert "SqlHash(" in repr(h)

    def test_hashable(self):
        h = SqlHash.from_sql("SELECT 1")
        s = {h}
        assert h in s


class TestObjectType:
    def test_values(self):
        assert ObjectType.PROCEDURE.value == "procedure"
        assert ObjectType.FUNCTION.value == "function"
        assert ObjectType.TRIGGER.value == "trigger"


class TestSeverity:
    def test_ordering(self):
        assert Severity.CRITICAL.value == "critical"
        assert Severity.LOW.value == "low"
