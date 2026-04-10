/**
 * Demo API layer — intercepts fetch calls and returns pre-loaded data
 * when VITE_DEMO_MODE=true. No backend required.
 */

interface DemoData {
  connections: any[];
  procedures: any[];
  dependencies: any[];
  tableAccesses: any[];
  analysisJobs: any[];
  tables: any[];
  analyses: Record<string, any>;
  parses: Record<string, any[]>;
}

let demoData: DemoData | null = null;
let sqlIndex: Map<string, string> | null = null;

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().substring(0, 80).toLowerCase();
}

function buildSqlIndex(data: DemoData): Map<string, string> {
  const index = new Map<string, string>();
  for (const p of data.procedures) {
    if (p.rawDefinition) {
      index.set(normalize(p.rawDefinition), p.id);
    }
  }
  return index;
}

function findProcIdBySql(sql: string, data: DemoData): string | null {
  if (!sqlIndex) sqlIndex = buildSqlIndex(data);
  const key = normalize(sql);
  // Exact match on normalized prefix
  const exact = sqlIndex.get(key);
  if (exact) return exact;
  // Fallback: find by prefix overlap
  for (const [k, id] of sqlIndex.entries()) {
    if (key.startsWith(k.substring(0, 40)) || k.startsWith(key.substring(0, 40))) return id;
  }
  // Last resort: match by object name in SQL
  const sqlLower = sql.toLowerCase();
  const match = data.procedures.find((p: any) => {
    const name = p.objectName.toLowerCase();
    return sqlLower.includes(`procedure ${name}`) || sqlLower.includes(`function ${name}`) || sqlLower.includes(` ${name}(`);
  });
  return match?.id || null;
}

async function loadDemoData(): Promise<DemoData> {
  if (demoData) return demoData;
  const res = await fetch('/demo-data.json');
  demoData = await res.json();
  return demoData!;
}

function ok<T>(data: T) {
  return { success: true, data };
}

function paginate<T>(items: T[], page: number, limit: number) {
  const start = (page - 1) * limit;
  return {
    items: items.slice(start, start + limit),
    total: items.length,
    page,
    limit,
    totalPages: Math.ceil(items.length / limit),
  };
}

export async function demoFetch(path: string, _options?: RequestInit): Promise<Response> {
  const data = await loadDemoData();
  const url = new URL(path, 'http://localhost');
  const segments = url.pathname.replace(/^\/api\/v1/, '').split('/').filter(Boolean);
  console.log('[demo-api]', _options?.method || 'GET', path, '-> segments:', segments);

  let body: any = { success: false, error: 'Not found' };
  let status = 200;

  // GET /auth/status
  if (segments[0] === 'auth' && segments[1] === 'status') {
    body = ok({ needsSetup: false, registrationMode: 'closed', multiTenant: false });
  }

  // POST /auth/login — fake login for demo
  else if (segments[0] === 'auth' && segments[1] === 'login') {
    const fakeJwt = btoa(JSON.stringify({ alg: 'HS256' })) + '.' +
      btoa(JSON.stringify({ sub: 'demo-user', email: 'demo@sqlatlas.dev', tenantId: 'demo-tenant', role: 'viewer', exp: Math.floor(Date.now() / 1000) + 86400 })) + '.demo';
    body = ok({ accessToken: fakeJwt, refreshToken: fakeJwt, expiresIn: 86400 });
  }

  // GET /connections
  else if (segments[0] === 'connections' && segments.length === 1) {
    body = ok(data.connections);
  }

  // GET /analysis/procedures/:connId
  else if (segments[0] === 'analysis' && segments[1] === 'procedures' && segments.length === 3) {
    const connId = segments[2];
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '20');
    const search = url.searchParams.get('search')?.toLowerCase();
    const schema = url.searchParams.get('schema');
    const secOnly = url.searchParams.get('securityOnly') === 'true';

    let procs = data.procedures.filter((p: any) => p.connectionId === connId);
    if (search) procs = procs.filter((p: any) => p.objectName.toLowerCase().includes(search) || p.schemaName.toLowerCase().includes(search));
    if (schema) procs = procs.filter((p: any) => p.schemaName === schema);
    if (secOnly) procs = procs.filter((p: any) => p.securityFindings?.length > 0);

    body = ok(paginate(procs, page, limit));
  }

  // GET /analysis/procedures/:connId/:procId
  else if (segments[0] === 'analysis' && segments[1] === 'procedures' && segments.length === 4) {
    const procId = segments[3];
    const proc = data.procedures.find((p: any) => p.id === procId);
    body = proc ? ok(proc) : { success: false, error: 'Not found' };
    if (!proc) status = 404;
  }

  // GET /analysis/graph/:connId
  else if (segments[0] === 'analysis' && segments[1] === 'graph') {
    const connId = segments[2];
    const connDeps = data.dependencies.filter((d: any) => d.connectionId === connId);
    const nodeIds = new Set<string>();
    connDeps.forEach((d: any) => {
      nodeIds.add(d.sourceId);
      if (d.targetId) nodeIds.add(d.targetId);
    });

    const procMap = new Map(data.procedures.map((p: any) => [p.id, p]));
    const nodes = Array.from(nodeIds).map((id) => {
      const p = procMap.get(id);
      if (p) {
        return { id, label: p.objectName, objectType: p.objectType, schemaName: p.schemaName, complexity: p.estimatedComplexity, securityIssueCount: p.securityFindings?.length || 0 };
      }
      const dep = connDeps.find((d: any) => d.targetId === id || d.sourceId === id);
      return { id, label: dep?.targetName || dep?.targetExternalName || 'unknown', objectType: 'external', schemaName: '', complexity: null, securityIssueCount: 0 };
    });

    const edges = connDeps.map((d: any) => ({
      id: d.id, source: d.sourceId, target: d.targetId || d.sourceId,
      dependencyType: d.dependencyType, isDynamic: d.isDynamic, confidence: d.confidence,
      sourceLabel: d.sourceName, targetLabel: d.targetName || d.targetExternalName || 'unknown',
    }));

    // Include table accesses as reads_from / writes_to edges
    const OP_MAP: Record<string, string> = { SELECT: 'reads_from', INSERT: 'writes_to', UPDATE: 'writes_to', DELETE: 'writes_to', MERGE: 'writes_to', TRUNCATE: 'writes_to' };
    const connAccesses = (data as any).tableAccesses?.filter((a: any) => a.connectionId === connId) || [];
    for (const ta of connAccesses) {
      const tableName = ta.fullTableName || ta.tableName;
      const shortName = tableName.split('.').pop() || tableName;
      const schema = tableName.includes('.') ? tableName.split('.')[0] : '';
      const virtualId = `tbl_${tableName.replace(/[^a-zA-Z0-9_.]/g, '_')}`;

      if (!nodeIds.has(virtualId)) {
        nodeIds.add(virtualId);
        nodes.push({ id: virtualId, label: shortName, objectType: 'table', schemaName: schema, complexity: null, securityIssueCount: 0 });
      }

      edges.push({
        id: `ta_${ta.procedureId}_${virtualId}`, source: ta.procedureId, target: virtualId,
        dependencyType: OP_MAP[ta.operation] || 'references', isDynamic: false, confidence: 1,
        sourceLabel: ta.procedureName || '', targetLabel: shortName,
      });
    }

    body = ok({
      nodes, edges,
      metadata: { totalNodes: nodes.length, totalEdges: edges.length, maxDepth: 5, rootNodeIds: [], leafNodeIds: [], circularDependencies: [] },
    });
  }

  // GET /analysis/jobs/:connId
  else if (segments[0] === 'analysis' && segments[1] === 'jobs') {
    const connId = segments[2];
    const jobs = data.analysisJobs.filter((j: any) => j.connectionId === connId);
    body = ok(jobs);
  }

  // GET /analysis/tables/:connId
  else if (segments[0] === 'analysis' && segments[1] === 'tables' && segments.length === 3) {
    const connId = segments[2];
    const schema = url.searchParams.get('schema');
    const search = url.searchParams.get('search')?.toLowerCase();
    let tables = (data as any).tables?.filter((t: any) => t.connectionId === connId) || [];
    if (schema) tables = tables.filter((t: any) => t.schemaName === schema);
    if (search) tables = tables.filter((t: any) => t.tableName.toLowerCase().includes(search));
    body = ok(tables.map((t: any) => ({ ...t, columnCount: t.columns?.length || 0 })));
  }

  // GET /analysis/tables/:connId/:tableId
  else if (segments[0] === 'analysis' && segments[1] === 'tables' && segments.length === 4) {
    const tableId = segments[3];
    const table = (data as any).tables?.find((t: any) => t.id === tableId);
    if (table) {
      const accessedBy = (data as any).tableAccesses
        ?.filter((a: any) => a.fullTableName === table.fullQualifiedName && a.connectionId === table.connectionId)
        .map((a: any) => ({ procedureId: a.procedureId, procedureName: a.procedureName, operation: a.operation })) || [];
      body = ok({ table: { ...table, columnCount: table.columns?.length || 0 }, accessedBy });
    } else {
      body = { success: false, error: 'Not found' }; status = 404;
    }
  }

  // GET /analysis/er-diagram/:connId
  else if (segments[0] === 'analysis' && segments[1] === 'er-diagram') {
    const connId = segments[2];
    const schema = url.searchParams.get('schema');
    let tables = (data as any).tables?.filter((t: any) => t.connectionId === connId) || [];
    if (schema) tables = tables.filter((t: any) => t.schemaName === schema);

    const erTables = tables.map((t: any) => ({
      id: t.id, schemaName: t.schemaName, tableName: t.tableName, fullQualifiedName: t.fullQualifiedName,
      columns: (t.columns || []).map((c: any) => ({ name: c.columnName, type: c.dataType, isPK: c.isPrimaryKey, isFK: c.isForeignKey, isNullable: c.isNullable })),
      estimatedRowCount: t.estimatedRowCount,
    }));

    const relationships: any[] = [];
    tables.forEach((t: any) => {
      (t.foreignKeys || []).forEach((fk: any, i: number) => {
        const target = tables.find((tt: any) => tt.fullQualifiedName === fk.referencedTable);
        if (target) {
          relationships.push({
            id: `${t.id}-fk-${i}`, constraintName: fk.constraintName,
            sourceTableId: t.id, sourceColumns: fk.columns,
            targetTableId: target.id, targetColumns: fk.referencedColumns,
            onDelete: fk.onDelete, onUpdate: fk.onUpdate,
          });
        }
      });
    });

    body = ok({ tables: erTables, relationships });
  }

  // POST /parser/api/v1/parse — segments: ['parser', 'api', 'v1', 'parse']
  else if (segments[0] === 'parser' && segments[segments.length - 1] === 'parse') {
    const reqBody = _options?.body ? JSON.parse(_options.body as string) : {};
    const procId = findProcIdBySql(reqBody.sql || '', data);
    if (procId && data.parses[procId]) {
      body = { success: true, data: data.parses[procId], errors: [], metadata: {} };
    } else {
      body = { success: true, data: [], errors: [], metadata: {} };
    }
  }

  // POST /parser/api/v1/analyze — segments: ['parser', 'api', 'v1', 'analyze']
  else if (segments[0] === 'parser' && segments[segments.length - 1] === 'analyze') {
    const reqBody = _options?.body ? JSON.parse(_options.body as string) : {};
    const procId = findProcIdBySql(reqBody.sql || '', data);
    if (procId && data.analyses[procId]) {
      body = { success: true, data: data.analyses[procId], errors: [] };
    } else {
      body = { success: true, data: { dependencies: [], tableReferences: [], securityFindings: [], complexity: null, flowTree: null }, errors: [] };
    }
  }

  // GET /parser/api/v1/dialects
  else if (segments[0] === 'parser' && segments[segments.length - 1] === 'dialects') {
    body = { dialects: ['tsql', 'plpgsql', 'plsql'] };
  }

  // GET /parser/health  (path: /parser/health -> segments: ['parser', 'health'])
  else if (segments[0] === 'parser' && (segments[1] === 'health' || segments.includes('health'))) {
    body = { status: 'healthy', service: 'parsing-engine-demo', version: '0.1.0' };
  }

  // GET /analysis/dashboard
  else if (segments[0] === 'analysis' && segments[1] === 'dashboard') {
    const recentJobs = data.analysisJobs.slice(0, 5).map((j: any) => {
      const conn = data.connections.find((c: any) => c.id === j.connectionId);
      return {
        id: j.id, connectionId: j.connectionId,
        connectionName: conn?.name || 'Unknown', engine: conn?.engine || 'unknown',
        status: j.status, progress: j.progress,
        totalObjects: j.totalObjects, createdAt: j.createdAt,
      };
    });
    body = ok({
      connections: data.connections.length,
      procedures: data.procedures.length,
      securityIssues: data.procedures.reduce(
        (sum: number, p: any) => sum + (p.securityFindings?.length || 0), 0,
      ),
      recentJobs,
    });
  }

  // POST /analysis/start — noop in demo
  else if (segments[0] === 'analysis' && segments[1] === 'start') {
    body = ok({ jobId: 'demo-job', message: 'Demo mode — analysis already pre-loaded' });
  }

  // POST /auth/logout
  else if (segments[0] === 'auth' && segments[1] === 'logout') {
    body = ok(null);
  }

  // GET /health
  else if (segments[0] === 'health') {
    body = { status: 'healthy', service: 'demo', version: '0.1.0' };
  }

  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
