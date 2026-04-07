#!/usr/bin/env python3
"""
Generate demo-data.json for SQLAtlas demo mode (Netlify/static deployment).

Usage:
  # From local DB (default)
  python scripts/generate-demo-data.py

  # Custom DB connection
  python scripts/generate-demo-data.py --host localhost --port 5433 --user sqlatlas --password changeme --db sqlatlas

  # With parsing engine for flow/analysis data
  python scripts/generate-demo-data.py --parser-url http://localhost:8100

  # Exclude specific connections
  python scripts/generate-demo-data.py --exclude-connection afe9d3c4-832a-4223-bcb1-9a6c1e7f94d5

Output: apps/web-client/public/demo-data.json
"""

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.request

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(SCRIPT_DIR)
OUTPUT = os.path.join(ROOT_DIR, "apps", "web-client", "public", "demo-data.json")


def psql(query: str, host: str, port: int, user: str, password: str, db: str) -> list:
    env = {**os.environ, "PGPASSWORD": password}
    r = subprocess.run(
        ["psql", "-h", host, "-p", str(port), "-U", user, "-d", db, "-t", "-A", "-c", query],
        capture_output=True, text=True, env=env,
    )
    out = r.stdout.strip()
    if not out:
        return []
    try:
        return json.loads(out)
    except json.JSONDecodeError:
        return []


def to_camel(s: str) -> str:
    parts = s.split("_")
    return parts[0] + "".join(p.capitalize() for p in parts[1:])


def camel_keys(obj):
    if isinstance(obj, dict):
        return {to_camel(k): camel_keys(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [camel_keys(i) for i in obj]
    return obj


def fetch_parser(url: str, endpoint: str, payload: dict, timeout: int = 30):
    try:
        req = urllib.request.Request(
            f"{url}/api/v1/{endpoint}",
            data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json"},
        )
        resp = urllib.request.urlopen(req, timeout=timeout)
        return json.loads(resp.read())
    except Exception:
        return None


def main():
    parser = argparse.ArgumentParser(description="Generate SQLAtlas demo data")
    parser.add_argument("--host", default=os.environ.get("DB_HOST", "localhost"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("DB_PORT", "5433")))
    parser.add_argument("--user", default=os.environ.get("DB_USERNAME", "sqlforensics"))
    parser.add_argument("--password", default=os.environ.get("DB_PASSWORD", "sqlforensics_dev"))
    parser.add_argument("--db", default=os.environ.get("DB_DATABASE", "sqlforensics"))
    parser.add_argument("--parser-url", default=os.environ.get("PARSER_URL", ""))
    parser.add_argument("--exclude-connection", action="append", default=[])
    parser.add_argument("--output", default=OUTPUT)
    parser.add_argument("--rate-limit-delay", type=float, default=2.5, help="Delay between parser requests (seconds)")
    args = parser.parse_args()

    db = dict(host=args.host, port=args.port, user=args.user, password=args.password, db=args.db)

    def q(query: str) -> list:
        return psql(query, **db)

    # Build exclude clause
    excludes = args.exclude_connection
    exclude_sql = " AND ".join(f"p.connection_id != '{e}'" for e in excludes) if excludes else "TRUE"
    exclude_conn_sql = " AND ".join(f"id != '{e}'" for e in excludes) if excludes else "TRUE"

    print("Extracting data from database...")

    connections = q(f"""SELECT json_agg(row_to_json(t)) FROM (
        SELECT id, name, engine, 'demo.sqlatlas.dev' as host, port, database_name,
               'demo_user' as username, use_ssl, last_tested_at, 'success' as last_test_status,
               is_active, created_at
        FROM db_connections WHERE {exclude_conn_sql}) t""")

    procedures = q(f"""SELECT json_agg(row_to_json(t)) FROM (
        SELECT id, object_name, schema_name, object_type, full_qualified_name, language,
               line_count, estimated_complexity, security_findings, auto_doc, parameters,
               connection_id, raw_definition
        FROM procedures p WHERE {exclude_sql}
        ORDER BY connection_id, schema_name, object_name) t""")

    deps = q(f"""SELECT json_agg(row_to_json(t)) FROM (
        SELECT d.id, d.source_id, d.target_id, d.target_external_name, d.dependency_type,
               d.is_dynamic, d.confidence, d.tenant_id,
               sp.object_name as source_name, sp.schema_name as source_schema,
               sp.object_type as source_type, sp.estimated_complexity as source_complexity, sp.connection_id,
               tp.object_name as target_name, tp.schema_name as target_schema,
               tp.object_type as target_type, tp.estimated_complexity as target_complexity
        FROM dependencies d
        JOIN procedures sp ON d.source_id = sp.id
        LEFT JOIN procedures tp ON d.target_id = tp.id
        WHERE {exclude_sql.replace('p.', 'sp.')}) t""")

    accesses = q(f"""SELECT json_agg(row_to_json(t)) FROM (
        SELECT ta.procedure_id, ta.table_name, ta.full_table_name, ta.operation,
               ta.columns, ta.is_temp_table, ta.is_dynamic, ta.confidence,
               p.object_name as procedure_name, p.schema_name as procedure_schema, p.connection_id
        FROM table_accesses ta JOIN procedures p ON ta.procedure_id = p.id
        WHERE {exclude_sql}) t""")

    jobs = q(f"""SELECT json_agg(row_to_json(t)) FROM (
        SELECT id, connection_id, status, progress, total_objects, processed_objects,
               started_at, completed_at, created_at
        FROM analysis_jobs WHERE status = 'completed'
        ORDER BY created_at DESC) t""")

    tables = q(f"""SELECT json_agg(row_to_json(t)) FROM (
        SELECT id, schema_name, table_name, full_qualified_name, table_type,
               estimated_row_count, columns, primary_key, foreign_keys, indexes,
               connection_id, referenced_by_count
        FROM discovered_tables dt WHERE {exclude_sql.replace('p.', 'dt.')}
        ORDER BY connection_id, schema_name, table_name) t""")

    print(f"  Connections: {len(connections or [])}")
    print(f"  Procedures:  {len(procedures or [])}")
    print(f"  Dependencies: {len(deps or [])}")
    print(f"  Tables:      {len(tables or [])}")
    print(f"  Accesses:    {len(accesses or [])}")

    # Generate parse/analyze data via parsing engine
    analyses = {}
    parses = {}

    if args.parser_url and procedures:
        # Get engine mapping
        conns = q("SELECT json_agg(row_to_json(t)) FROM (SELECT id, engine FROM db_connections) t")
        engine_map = {c["id"]: c["engine"] for c in (conns or [])}
        dialect_map = {"sqlserver": "tsql", "postgresql": "plpgsql", "oracle": "plsql"}

        procs_with_src = [p for p in procedures if p.get("raw_definition") and len(p["raw_definition"]) > 10]
        print(f"\nAnalyzing {len(procs_with_src)} procedures via {args.parser_url}...")

        for i, p in enumerate(procs_with_src):
            dialect = dialect_map.get(engine_map.get(p["connection_id"], ""), "plpgsql")
            pid = p["id"]

            result = fetch_parser(args.parser_url, "analyze", {"sql": p["raw_definition"], "dialect": dialect})
            if result and result.get("success") and result.get("data"):
                analyses[pid] = result["data"]

            time.sleep(args.rate_limit_delay)

            result = fetch_parser(args.parser_url, "parse", {"sql": p["raw_definition"], "dialect": dialect})
            if result and result.get("success"):
                parses[pid] = result.get("data", [])

            time.sleep(args.rate_limit_delay)

            if (i + 1) % 10 == 0:
                flows = sum(1 for a in analyses.values() if a.get("flowTree"))
                print(f"  [{i+1}/{len(procs_with_src)}] analyzed={len(analyses)} parsed={len(parses)} flows={flows}")

        flows = sum(1 for a in analyses.values() if a.get("flowTree"))
        print(f"  Done: {len(analyses)} analyzed, {len(parses)} parsed, {flows} flows")

    # Assemble
    data = {
        "connections": camel_keys(connections or []),
        "procedures": camel_keys(procedures or []),
        "dependencies": camel_keys(deps or []),
        "tableAccesses": camel_keys(accesses or []),
        "analysisJobs": camel_keys(jobs or []),
        "tables": camel_keys(tables or []),
        "analyses": analyses,
        "parses": parses,
    }

    output = json.dumps(data, separators=(",", ":"))
    os.makedirs(os.path.dirname(args.output), exist_ok=True)
    with open(args.output, "w") as f:
        f.write(output)

    print(f"\nOutput: {args.output} ({len(output) // 1024} KB)")
    for c in data["connections"]:
        cid = c["id"]
        procs = sum(1 for p in data["procedures"] if p["connectionId"] == cid)
        d = sum(1 for x in data["dependencies"] if x["connectionId"] == cid)
        t = sum(1 for x in data["tables"] if x["connectionId"] == cid)
        print(f"  {c['name']} ({c['engine']}): {procs} procs, {d} deps, {t} tables")


if __name__ == "__main__":
    main()
