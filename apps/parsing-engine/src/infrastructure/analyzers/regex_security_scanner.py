"""Infrastructure: Security scanner using regex pattern matching."""

from __future__ import annotations

import re
from typing import Any

from src.domain.entities.security_finding import SecurityFinding
from src.domain.services.security_scanner import ISecurityScanner
from src.domain.value_objects.severity import Severity

_COMMON_RULES: list[tuple[str, Severity, str, str, str]] = [
    (r"EXEC(?:UTE)?\s*\(\s*@\w+", Severity.HIGH, "sql_injection_risk",
     "Dynamic SQL execution with variable",
     "Use parameterized queries or sp_executesql with parameters"),
    (r"EXEC(?:UTE)?\s*\(\s*'[^']*'\s*\+", Severity.HIGH, "sql_injection_risk",
     "String concatenation in EXEC",
     "Use parameterized queries"),
    (r"\bxp_cmdshell\b", Severity.CRITICAL, "os_command_execution",
     "xp_cmdshell allows OS command execution",
     "Remove xp_cmdshell; use safer alternatives"),
    (r"\bOPENROWSET\b|\bOPENDATASOURCE\b", Severity.HIGH, "external_access",
     "External data access via OPENROWSET/OPENDATASOURCE",
     "Review if external data access is necessary"),
    (r"\bGRANT\b", Severity.MEDIUM, "privilege_escalation",
     "GRANT statement in procedure body",
     "Avoid granting permissions inside stored procedures"),
    (r"WITH\s+EXECUTE\s+AS\s+", Severity.MEDIUM, "impersonation",
     "EXECUTE AS context switching",
     "Review for least-privilege principle"),
]

_TSQL_RULES: list[tuple[str, Severity, str, str, str]] = [
    (r"sp_executesql\s+@\w+", Severity.MEDIUM, "sql_injection_risk",
     "sp_executesql with dynamic string",
     "Verify parameters are properly bound"),
]

_PLPGSQL_RULES: list[tuple[str, Severity, str, str, str]] = [
    (r"SECURITY\s+DEFINER", Severity.MEDIUM, "security_definer",
     "Function runs with SECURITY DEFINER (owner privileges)",
     "Consider SECURITY INVOKER"),
    (r"\bdblink\b", Severity.HIGH, "external_access",
     "dblink usage — cross-database access",
     "Review connection strings for hardcoded credentials"),
]

_PLSQL_RULES: list[tuple[str, Severity, str, str, str]] = [
    (r"EXECUTE\s+IMMEDIATE", Severity.HIGH, "sql_injection_risk",
     "PL/SQL EXECUTE IMMEDIATE",
     "Use bind variables with USING clause"),
    (r"DBMS_SQL", Severity.MEDIUM, "dynamic_sql",
     "DBMS_SQL — low-level dynamic SQL",
     "Prefer EXECUTE IMMEDIATE with bind variables"),
    (r"UTL_HTTP|UTL_FILE|UTL_SMTP", Severity.HIGH, "external_access",
     "Oracle utility package for external access",
     "Review permissions and URL/path validation"),
    (r"AUTHID\s+DEFINER", Severity.MEDIUM, "privilege_escalation",
     "AUTHID DEFINER — runs with owner privileges",
     "Consider AUTHID CURRENT_USER"),
]

_DIALECT_RULES: dict[str, list[tuple[str, Severity, str, str, str]]] = {
    "tsql": _TSQL_RULES,
    "plpgsql": _PLPGSQL_RULES,
    "postgres": _PLPGSQL_RULES,
    "postgresql": _PLPGSQL_RULES,
    "plsql": _PLSQL_RULES,
    "oracle": _PLSQL_RULES,
}


class RegexSecurityScanner(ISecurityScanner):
    def scan(self, sql: str, dialect: str) -> list[SecurityFinding]:
        findings: list[SecurityFinding] = []
        all_rules = _COMMON_RULES + _DIALECT_RULES.get(dialect.lower(), [])

        for pattern, severity, finding_type, message, recommendation in all_rules:
            for match in re.finditer(pattern, sql, re.IGNORECASE):
                line = sql[: match.start()].count("\n") + 1
                findings.append(SecurityFinding(
                    severity=severity,
                    finding_type=finding_type,
                    message=message,
                    line=line,
                    recommendation=recommendation,
                ))

        # Hardcoded credentials
        if re.search(
            r"(?:password|pwd|passwd|secret)\s*[=:]\s*['\"]([^'\"]+)['\"]",
            sql, re.IGNORECASE,
        ):
            findings.append(SecurityFinding(
                severity=Severity.CRITICAL,
                finding_type="hardcoded_credentials",
                message="Hardcoded credentials detected",
                recommendation="Use environment variables or a secrets manager",
            ))

        return findings

    def get_rules(self, dialect: str) -> list[dict[str, Any]]:
        all_rules = _COMMON_RULES + _DIALECT_RULES.get(dialect.lower(), [])
        return [
            {
                "pattern": pattern,
                "severity": severity.value,
                "findingType": finding_type,
                "message": message,
                "recommendation": recommendation,
            }
            for pattern, severity, finding_type, message, recommendation in all_rules
        ]
