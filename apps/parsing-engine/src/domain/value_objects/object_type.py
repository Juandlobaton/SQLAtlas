"""Value Object: Database object type."""

from enum import Enum


class ObjectType(str, Enum):
    PROCEDURE = "procedure"
    FUNCTION = "function"
    TRIGGER = "trigger"
    VIEW = "view"
    PACKAGE = "package"
