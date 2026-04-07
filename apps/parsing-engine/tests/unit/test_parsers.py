"""Integration tests for all three SQL parsers via the use case layer."""

from src.application.dto.parse_dto import ParseInput
from src.infrastructure.web.container import container


class TestTSqlParser:
    use_case = container.parse_sql_use_case

    def test_parse_simple_procedure(self):
        sql = (
            "CREATE PROCEDURE dbo.sp_Test @Id INT"
            " AS BEGIN SELECT 1 FROM dbo.Users WHERE Id = @Id; END"
        )
        result = self.use_case.execute(ParseInput(sql=sql, dialect="tsql"))
        assert result.success
        assert len(result.results) == 1
        assert result.results[0]["objectType"] == "procedure"

    def test_detect_exec_dependencies(self):
        sql = """CREATE PROCEDURE dbo.sp_Main AS BEGIN
            EXEC dbo.sp_First;
            EXEC dbo.sp_Second @Param = 1;
            EXEC dbo.sp_HandleError;
        END"""
        result = self.use_case.execute(ParseInput(sql=sql, dialect="tsql"))
        assert result.success
        deps = result.results[0]["dependencies"]
        dep_names = [d["targetName"] for d in deps]
        assert "dbo.sp_First" in dep_names
        assert "dbo.sp_Second" in dep_names
        assert "dbo.sp_HandleError" in dep_names

    def test_detect_table_references(self):
        sql = """CREATE PROCEDURE dbo.sp_Report AS BEGIN
            SELECT * FROM dbo.Orders o JOIN dbo.Customers c ON o.CustId = c.Id;
            INSERT INTO dbo.AuditLog VALUES ('report', GETDATE());
        END"""
        result = self.use_case.execute(ParseInput(sql=sql, dialect="tsql"))
        tables = result.results[0]["tableReferences"]
        table_names = [t["fullName"] for t in tables]
        assert any("Orders" in n for n in table_names)
        assert any("Customers" in n for n in table_names)

    def test_detect_security_issues(self):
        sql = (
            "CREATE PROCEDURE dbo.sp_Unsafe AS BEGIN"
            " EXEC(@dynamicSql); EXEC xp_cmdshell 'dir'; END"
        )
        result = self.use_case.execute(ParseInput(sql=sql, dialect="tsql"))
        findings = result.results[0]["securityFindings"]
        types = [f["findingType"] for f in findings]
        assert "sql_injection_risk" in types or "os_command_execution" in types

    def test_complexity_metrics(self):
        sql = """CREATE PROCEDURE dbo.sp_Complex AS BEGIN
            IF 1=1 BEGIN IF 2=2 BEGIN WHILE 1=1 BEGIN BREAK; END END END
        END"""
        result = self.use_case.execute(ParseInput(sql=sql, dialect="tsql"))
        cc = result.results[0]["complexity"]
        assert cc["cyclomaticComplexity"] >= 3
        assert cc["nestingDepth"] >= 2

    def test_parameter_extraction(self):
        sql = (
            "CREATE PROCEDURE dbo.sp_Params"
            " @Name VARCHAR(100), @Age INT = 25, @Out INT OUTPUT"
            " AS SELECT 1"
        )
        result = self.use_case.execute(ParseInput(sql=sql, dialect="tsql"))
        params = result.results[0]["parameters"]
        assert len(params) >= 2
        names = [p["name"] for p in params]
        assert "@Name" in names
        assert "@Age" in names

    def test_flow_tree(self):
        sql = """CREATE PROCEDURE dbo.sp_Flow AS BEGIN
            IF 1=1 SELECT 1;
            EXEC dbo.sp_Sub;
            RETURN;
        END"""
        result = self.use_case.execute(ParseInput(sql=sql, dialect="tsql"))
        flow = result.results[0]["flowTree"]
        assert flow is not None
        assert flow["nodeType"] == "start"
        assert len(flow["children"]) > 0


class TestPlPgSqlParser:
    use_case = container.parse_sql_use_case

    def test_parse_function(self):
        sql = """CREATE OR REPLACE FUNCTION public.my_func(p_id INT)
        RETURNS void LANGUAGE plpgsql AS $$
        BEGIN UPDATE items SET x = 1 WHERE id = p_id; END; $$;"""
        result = self.use_case.execute(ParseInput(sql=sql, dialect="postgres"))
        assert result.success
        assert len(result.results) >= 1

    def test_detect_security_definer(self):
        sql = """CREATE FUNCTION public.risky() RETURNS void
        LANGUAGE plpgsql SECURITY DEFINER AS $$
        BEGIN PERFORM dblink('host=x', 'SELECT 1'); END; $$;"""
        result = self.use_case.execute(ParseInput(sql=sql, dialect="postgres"))
        findings = result.results[0]["securityFindings"]
        types = [f["findingType"] for f in findings]
        assert "security_definer" in types or "external_access" in types

    def test_anonymous_block(self):
        sql = "SELECT * FROM orders WHERE status = 'active';"
        result = self.use_case.execute(ParseInput(sql=sql, dialect="postgres"))
        assert result.success
        assert len(result.results) >= 1


class TestPlSqlParser:
    use_case = container.parse_sql_use_case

    def test_parse_oracle_procedure(self):
        sql = """CREATE OR REPLACE PROCEDURE billing.gen_invoice(p_id NUMBER) AS
        BEGIN INSERT INTO invoices VALUES (p_id, SYSDATE); END;"""
        result = self.use_case.execute(ParseInput(sql=sql, dialect="oracle"))
        assert result.success

    def test_detect_execute_immediate(self):
        sql = """CREATE PROCEDURE admin.run_dynamic(p_sql VARCHAR2) AS
        BEGIN EXECUTE IMMEDIATE p_sql; END;"""
        result = self.use_case.execute(ParseInput(sql=sql, dialect="oracle"))
        findings = result.results[0]["securityFindings"]
        types = [f["findingType"] for f in findings]
        assert "sql_injection_risk" in types


class TestBatchParse:
    use_case = container.batch_parse_use_case

    def test_batch_multiple_dialects(self):
        from src.application.dto.parse_dto import BatchParseInput
        items = [
            ParseInput(sql="SELECT 1", dialect="tsql"),
            ParseInput(sql="SELECT 1", dialect="postgres"),
            ParseInput(sql="SELECT 1", dialect="oracle"),
        ]
        result = self.use_case.execute(BatchParseInput(items=items))
        assert result.total_processed == 3
        assert result.success


class TestAnalyze:
    use_case = container.analyze_sql_use_case

    def test_analyze_all_types(self):
        from src.application.dto.parse_dto import AnalyzeInput
        sql = """CREATE PROCEDURE dbo.sp_X AS BEGIN
            IF 1=1 EXEC dbo.sp_Y;
            INSERT INTO dbo.Log VALUES (1);
            GRANT SELECT ON dbo.Log TO public;
        END"""
        result = self.use_case.execute(AnalyzeInput(sql=sql, dialect="tsql"))
        assert result.success or len(result.errors) == 0
        assert result.complexity is not None
        assert result.flow_tree is not None


class TestDialects:
    def test_supported_dialects(self):
        dialects = container.supported_dialects
        assert "tsql" in dialects
        assert "postgres" in dialects
        assert "oracle" in dialects
        assert len(dialects) >= 6

    def test_unsupported_dialect_fails_gracefully(self):
        use_case = container.parse_sql_use_case
        result = use_case.execute(ParseInput(sql="SELECT 1", dialect="mysql"))
        assert not result.success
        assert len(result.errors) > 0
