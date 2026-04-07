"""Value Object: Database object type."""

from enum import StrEnum


class ObjectType(StrEnum):
    PROCEDURE = "procedure"
    FUNCTION = "function"
    TRIGGER = "trigger"
    VIEW = "view"
    PACKAGE = "package"
