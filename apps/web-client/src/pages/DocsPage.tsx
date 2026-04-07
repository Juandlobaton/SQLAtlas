import { useState } from 'react';
import {
  Play, Copy, Check, ChevronRight, Shield, GitBranch, Table2,
  Database, Code, BookOpen, Workflow, AlertTriangle, Clock,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/shared/lib/utils';

type Dialect = 'tsql' | 'plpgsql' | 'plsql';

interface DocExample {
  dialect: Dialect;
  title: string;
  description: string;
  sql: string;
  expectedDeps: string[];
  expectedTables: string[];
  securityNotes: string[];
  executionTrace: TraceStep[];
}

interface TraceStep {
  step: number;
  line: number;
  type: 'entry' | 'condition' | 'query' | 'call' | 'write' | 'return' | 'error';
  description: string;
  data?: string;
  duration?: string;
}

const EXAMPLES: DocExample[] = [
  {
    dialect: 'tsql',
    title: 'T-SQL: Order Processing Pipeline',
    description: 'Multi-step order processing with nested SP calls, error handling, and audit logging. Demonstrates EXEC chaining, TRY/CATCH, and transaction management.',
    sql: `CREATE PROCEDURE dbo.sp_ProcessOrder
  @OrderId INT,
  @UserId INT,
  @ApplyDiscount BIT = 0
AS
BEGIN
  SET NOCOUNT ON;
  DECLARE @Total DECIMAL(18,2);

  BEGIN TRY
    BEGIN TRANSACTION;

    -- 1. Validate
    IF NOT EXISTS (SELECT 1 FROM dbo.Orders WHERE OrderId = @OrderId AND Status = 'pending')
      RAISERROR('Order %d not found or not pending', 16, 1, @OrderId);

    -- 2. Lock and update
    UPDATE dbo.Orders SET Status = 'processing', ProcessedBy = @UserId WHERE OrderId = @OrderId;

    -- 3. Apply discount
    IF @ApplyDiscount = 1
      EXEC dbo.sp_ApplyDiscount @OrderId;

    -- 4. Calculate
    EXEC dbo.sp_RecalculateTotals @OrderId, @Total OUTPUT;

    -- 5. Inventory check
    EXEC dbo.sp_ValidateInventory @OrderId;

    -- 6. Audit
    INSERT INTO audit.ActionLog (Action, EntityId, UserId, Amount, CreatedAt)
    VALUES ('ORDER_PROCESSED', @OrderId, @UserId, @Total, GETDATE());

    -- 7. Notify
    EXEC dbo.sp_SendNotification @OrderId, 'order_processed';

    COMMIT TRANSACTION;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    EXEC dbo.sp_HandleError;
    THROW;
  END CATCH
END;`,
    expectedDeps: ['dbo.sp_ApplyDiscount', 'dbo.sp_RecalculateTotals', 'dbo.sp_ValidateInventory', 'dbo.sp_SendNotification', 'dbo.sp_HandleError'],
    expectedTables: ['dbo.Orders (SELECT, UPDATE)', 'audit.ActionLog (INSERT)'],
    securityNotes: ['Uses parameterized operations', 'Proper transaction handling', 'Error logging via sp_HandleError'],
    executionTrace: [
      { step: 1, line: 1, type: 'entry', description: 'Enter sp_ProcessOrder', data: '@OrderId=1042, @UserId=5, @ApplyDiscount=1' },
      { step: 2, line: 14, type: 'condition', description: 'Validate order exists and is pending', data: 'SELECT 1 FROM dbo.Orders WHERE OrderId=1042 → EXISTS=true' },
      { step: 3, line: 18, type: 'write', description: 'UPDATE order status to processing', data: 'dbo.Orders SET Status=\'processing\' WHERE OrderId=1042', duration: '2ms' },
      { step: 4, line: 21, type: 'condition', description: 'Check @ApplyDiscount flag', data: '@ApplyDiscount=1 → TRUE branch' },
      { step: 5, line: 22, type: 'call', description: 'EXEC dbo.sp_ApplyDiscount', data: '@OrderId=1042 → 15% discount applied', duration: '8ms' },
      { step: 6, line: 25, type: 'call', description: 'EXEC dbo.sp_RecalculateTotals', data: '@OrderId=1042 → @Total=$847.50', duration: '12ms' },
      { step: 7, line: 28, type: 'call', description: 'EXEC dbo.sp_ValidateInventory', data: '@OrderId=1042 → all items available', duration: '15ms' },
      { step: 8, line: 31, type: 'write', description: 'INSERT audit log', data: 'audit.ActionLog → ORDER_PROCESSED, Amount=$847.50', duration: '1ms' },
      { step: 9, line: 35, type: 'call', description: 'EXEC dbo.sp_SendNotification', data: '@OrderId=1042, @Type=\'order_processed\'', duration: '25ms' },
      { step: 10, line: 37, type: 'return', description: 'COMMIT TRANSACTION — success', duration: '3ms total: 66ms' },
    ],
  },
  {
    dialect: 'plpgsql',
    title: 'PL/pgSQL: Component Stock Trigger',
    description: 'Trigger function that automatically updates stock counts when component instances change. Shows NEW/OLD references, subquery patterns, and conditional updates.',
    sql: `CREATE OR REPLACE FUNCTION components.update_component_stock()
RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  target_id INTEGER;
  inst_count INTEGER;
BEGIN
  -- Determine target component
  IF TG_OP = 'DELETE' THEN
    target_id := OLD.component_id;
  ELSE
    target_id := NEW.component_id;
  END IF;

  -- Count instances
  SELECT COUNT(*) INTO inst_count
  FROM components.component_instances
  WHERE component_id = target_id;

  -- Update stock
  UPDATE components.components SET
    available_stock = (SELECT COUNT(*) FROM components.component_instances
                       WHERE component_id = target_id AND status = 'available'),
    reserved_stock = (SELECT COUNT(*) FROM components.component_instances
                      WHERE component_id = target_id AND status = 'reserved'),
    has_instances = (inst_count > 0),
    updated_at = NOW()
  WHERE id = target_id;

  -- Handle component transfer
  IF TG_OP = 'UPDATE' AND OLD.component_id IS DISTINCT FROM NEW.component_id THEN
    PERFORM components.update_component_stock_for(OLD.component_id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;`,
    expectedDeps: ['components.update_component_stock_for'],
    expectedTables: ['components.component_instances (SELECT)', 'components.components (UPDATE)'],
    securityNotes: ['No dynamic SQL', 'Uses SECURITY INVOKER (implicit)', 'Safe trigger pattern'],
    executionTrace: [
      { step: 1, line: 1, type: 'entry', description: 'Trigger fires on component_instances INSERT', data: 'NEW.component_id=42, NEW.status=\'available\'' },
      { step: 2, line: 9, type: 'condition', description: 'TG_OP = \'DELETE\'?', data: 'TG_OP=\'INSERT\' → ELSE branch' },
      { step: 3, line: 12, type: 'query', description: 'Assign target_id from NEW', data: 'target_id := 42' },
      { step: 4, line: 16, type: 'query', description: 'Count all instances for component', data: 'SELECT COUNT(*) → inst_count=15', duration: '1ms' },
      { step: 5, line: 20, type: 'write', description: 'UPDATE component stock counts', data: 'available_stock=12, reserved_stock=3, has_instances=true', duration: '2ms' },
      { step: 6, line: 29, type: 'condition', description: 'Check if component changed (transfer)', data: 'TG_OP=\'INSERT\' → FALSE, skip' },
      { step: 7, line: 33, type: 'return', description: 'RETURN NEW', data: 'Row returned to trigger caller', duration: 'total: 3ms' },
    ],
  },
  {
    dialect: 'plsql',
    title: 'PL/SQL: Invoice Generation with Validation',
    description: 'Oracle procedure that generates invoices with multi-step validation, cursor processing, and exception handling. Demonstrates %ROWTYPE, FOR loops, and RAISE_APPLICATION_ERROR.',
    sql: `CREATE OR REPLACE PROCEDURE billing.generate_invoice(
  p_customer_id  IN  NUMBER,
  p_period_start IN  DATE,
  p_period_end   IN  DATE,
  p_invoice_id   OUT NUMBER
) AS
  v_total       NUMBER(18,2) := 0;
  v_line_count  NUMBER := 0;
  v_customer    customers%ROWTYPE;

  CURSOR c_charges IS
    SELECT service_id, description, amount, quantity
    FROM billing.pending_charges
    WHERE customer_id = p_customer_id
      AND charge_date BETWEEN p_period_start AND p_period_end
      AND status = 'pending'
    ORDER BY charge_date;
BEGIN
  -- 1. Validate customer
  SELECT * INTO v_customer FROM customers WHERE id = p_customer_id;

  IF v_customer.status != 'ACTIVE' THEN
    RAISE_APPLICATION_ERROR(-20001, 'Customer ' || p_customer_id || ' is not active');
  END IF;

  -- 2. Create invoice header
  INSERT INTO billing.invoices (customer_id, period_start, period_end, status, created_at)
  VALUES (p_customer_id, p_period_start, p_period_end, 'draft', SYSDATE)
  RETURNING id INTO p_invoice_id;

  -- 3. Process charges
  FOR rec IN c_charges LOOP
    v_line_count := v_line_count + 1;

    INSERT INTO billing.invoice_lines (invoice_id, line_number, service_id, description, amount, quantity)
    VALUES (p_invoice_id, v_line_count, rec.service_id, rec.description, rec.amount, rec.quantity);

    v_total := v_total + (rec.amount * rec.quantity);

    UPDATE billing.pending_charges SET status = 'invoiced', invoice_id = p_invoice_id
    WHERE service_id = rec.service_id AND customer_id = p_customer_id;
  END LOOP;

  -- 4. Update totals
  UPDATE billing.invoices SET subtotal = v_total, tax = v_total * 0.19,
    total = v_total * 1.19, line_count = v_line_count
  WHERE id = p_invoice_id;

  -- 5. Log
  billing.log_action('INVOICE_GENERATED', 'invoice', p_invoice_id);

  COMMIT;
EXCEPTION
  WHEN NO_DATA_FOUND THEN
    RAISE_APPLICATION_ERROR(-20002, 'Customer not found: ' || p_customer_id);
  WHEN OTHERS THEN
    ROLLBACK;
    billing.log_error(SQLCODE, SQLERRM, 'generate_invoice');
    RAISE;
END generate_invoice;`,
    expectedDeps: ['billing.log_action', 'billing.log_error'],
    expectedTables: [
      'customers (SELECT)',
      'billing.invoices (INSERT, UPDATE)',
      'billing.invoice_lines (INSERT)',
      'billing.pending_charges (SELECT, UPDATE)',
    ],
    securityNotes: ['Uses bind variables (p_customer_id)', 'Proper exception handling', 'COMMIT/ROLLBACK pattern'],
    executionTrace: [
      { step: 1, line: 1, type: 'entry', description: 'Enter generate_invoice', data: 'p_customer_id=1001, period=2026-01-01..2026-01-31' },
      { step: 2, line: 20, type: 'query', description: 'Fetch customer record', data: 'SELECT * FROM customers WHERE id=1001 → status=ACTIVE', duration: '1ms' },
      { step: 3, line: 22, type: 'condition', description: 'Check customer is active', data: 'status=\'ACTIVE\' → OK, continue' },
      { step: 4, line: 27, type: 'write', description: 'INSERT invoice header', data: 'billing.invoices → p_invoice_id=50234', duration: '2ms' },
      { step: 5, line: 32, type: 'query', description: 'Open cursor c_charges', data: '12 pending charges found', duration: '3ms' },
      { step: 6, line: 35, type: 'write', description: 'Loop iteration 1/12: INSERT invoice line', data: 'service_id=101, amount=29.99, qty=1', duration: '1ms' },
      { step: 7, line: 35, type: 'write', description: 'Loop iterations 2-12 completed', data: '11 more lines inserted', duration: '11ms' },
      { step: 8, line: 44, type: 'write', description: 'UPDATE invoice totals', data: 'subtotal=$847.50, tax=$161.03, total=$1,008.53', duration: '1ms' },
      { step: 9, line: 48, type: 'call', description: 'billing.log_action', data: 'INVOICE_GENERATED, invoice#50234', duration: '1ms' },
      { step: 10, line: 50, type: 'return', description: 'COMMIT', data: 'p_invoice_id=50234 returned', duration: 'total: 20ms' },
    ],
  },
];

export function DocsPage() {
  const { t } = useTranslation(['docs', 'common']);
  const [selectedDialect, setSelectedDialect] = useState<Dialect | 'all'>('all');
  const [expandedExample, setExpandedExample] = useState<number | null>(0);
  const [activeSection, setActiveSection] = useState<string>('trace');
  const [copied, setCopied] = useState<number | null>(null);

  const filtered = selectedDialect === 'all' ? EXAMPLES : EXAMPLES.filter((e) => e.dialect === selectedDialect);

  const copySQL = (idx: number, sql: string) => {
    navigator.clipboard.writeText(sql);
    setCopied(idx);
    setTimeout(() => setCopied(null), 2000);
  };

  const STEP_STYLES: Record<string, { bg: string; icon: typeof Play; color: string }> = {
    entry: { bg: 'bg-blue-50 dark:bg-blue-900/20', icon: Play, color: 'text-blue-500' },
    condition: { bg: 'bg-amber-50 dark:bg-amber-900/20', icon: GitBranch, color: 'text-amber-500' },
    query: { bg: 'bg-purple-50 dark:bg-purple-900/20', icon: Database, color: 'text-purple-500' },
    call: { bg: 'bg-cyan-50 dark:bg-cyan-900/20', icon: Workflow, color: 'text-cyan-500' },
    write: { bg: 'bg-orange-50 dark:bg-orange-900/20', icon: Table2, color: 'text-orange-500' },
    return: { bg: 'bg-emerald-50 dark:bg-emerald-900/20', icon: Check, color: 'text-emerald-500' },
    error: { bg: 'bg-red-50 dark:bg-red-900/20', icon: AlertTriangle, color: 'text-red-500' },
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-brand-500" />
            {t('docs:title')}
          </h1>
          <p className="text-surface-500 text-sm mt-1">
            {t('docs:subtitle')}
          </p>
        </div>

        <div className="flex items-center gap-1 bg-surface-100 rounded-lg p-1">
          {[
            { id: 'all', label: t('docs:filters.all') },
            { id: 'tsql', label: t('docs:filters.tsql') },
            { id: 'plpgsql', label: t('docs:filters.plpgsql') },
            { id: 'plsql', label: t('docs:filters.plsql') },
          ].map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setSelectedDialect(id as Dialect | 'all')}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                selectedDialect === id ? 'bg-brand-600 text-white' : 'text-surface-500 hover:text-surface-700',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Examples */}
      <div className="space-y-4">
        {filtered.map((example, idx) => {
          const isExpanded = expandedExample === idx;
          const dialectColors: Record<string, string> = {
            tsql: 'bg-red-500',
            plpgsql: 'bg-blue-500',
            plsql: 'bg-orange-500',
          };

          return (
            <div key={`${example.dialect}-${example.title}`} className="card overflow-hidden">
              {/* Header */}
              <button
                onClick={() => setExpandedExample(isExpanded ? null : idx)}
                className="w-full px-5 py-4 flex items-center gap-4 hover:bg-surface-100/50 transition-colors"
              >
                <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-xs', dialectColors[example.dialect])}>
                  {example.dialect === 'tsql' ? 'SS' : example.dialect === 'plpgsql' ? 'PG' : 'OR'}
                </div>
                <div className="text-left flex-1 min-w-0">
                  <h3 className="font-semibold text-sm">{example.title}</h3>
                  <p className="text-xs text-surface-500 truncate">{example.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="badge-info">{example.expectedDeps.length} deps</span>
                  <span className="badge-info">{example.expectedTables.length} tables</span>
                  <span className="badge-info">{example.executionTrace.length} steps</span>
                  <ChevronRight className={cn('w-4 h-4 text-surface-400 transition-transform', isExpanded && 'rotate-90')} />
                </div>
              </button>

              {/* Expanded Content */}
              {isExpanded && (
                <div className="border-t border-surface-200">
                  {/* Sub-tabs */}
                  <div className="flex border-b border-surface-200 px-2 bg-surface-50">
                    {[
                      { id: 'trace', label: t('docs:tabs.trace'), icon: Play },
                      { id: 'code', label: t('docs:tabs.source'), icon: Code },
                      { id: 'deps', label: t('docs:tabs.dependencies'), icon: GitBranch },
                      { id: 'security', label: t('docs:tabs.security'), icon: Shield },
                    ].map(({ id, label, icon: Icon }) => (
                      <button
                        key={id}
                        onClick={() => setActiveSection(id)}
                        className={cn(
                          'flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors',
                          activeSection === id ? 'border-brand-500 text-brand-600' : 'border-transparent text-surface-500 hover:text-surface-700',
                        )}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {label}
                      </button>
                    ))}
                  </div>

                  <div className="p-5">
                    {/* Execution Trace */}
                    {activeSection === 'trace' && (
                      <div className="space-y-0">
                        <p className="text-xs text-surface-500 mb-4">
                          {t('docs:traceInstruction')}
                        </p>
                        {example.executionTrace.map((step, i) => {
                          const style = STEP_STYLES[step.type];
                          const Icon = style?.icon || Play;
                          return (
                            <div key={`step-${step.step}-${step.type}`} className="flex gap-3 group">
                              {/* Timeline */}
                              <div className="flex flex-col items-center">
                                <div className={cn('w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 border-2 border-surface-200', style?.bg)}>
                                  <Icon className={cn('w-3.5 h-3.5', style?.color)} />
                                </div>
                                {i < example.executionTrace.length - 1 && (
                                  <div className="w-0.5 h-full bg-surface-200 min-h-[20px]" />
                                )}
                              </div>
                              {/* Content */}
                              <div className={cn('flex-1 pb-4 rounded-lg px-3 py-2 mb-1', style?.bg)}>
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-bold text-surface-400">{t('docs:step', { number: step.step })}</span>
                                    <span className="text-[10px] text-surface-400">{t('docs:line', { number: step.line })}</span>
                                    <span className={cn('badge text-[10px]', style?.bg, style?.color)}>{t(`docs:stepTypes.${step.type}`)}</span>
                                  </div>
                                  {step.duration && (
                                    <span className="flex items-center gap-1 text-[10px] text-surface-400">
                                      <Clock className="w-3 h-3" />
                                      {step.duration}
                                    </span>
                                  )}
                                </div>
                                <p className="text-sm font-medium mt-1">{step.description}</p>
                                {step.data && (
                                  <p className="text-xs font-mono text-surface-500 mt-1 bg-surface-0/50 dark:bg-surface-900/30 rounded px-2 py-1">
                                    {step.data}
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Source Code */}
                    {activeSection === 'code' && (
                      <div className="relative">
                        <button
                          onClick={() => copySQL(idx, example.sql)}
                          className="absolute top-2 right-2 btn-ghost p-1.5"
                        >
                          {copied === idx ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                        <pre className="bg-surface-100 rounded-lg p-4 overflow-x-auto text-xs font-mono leading-relaxed text-surface-700">
                          {example.sql.split('\n').map((line, i) => (
                            <div key={`line-${i}`} className="flex hover:bg-surface-200/50">
                              <span className="text-surface-400 w-8 text-right mr-4 select-none flex-shrink-0">{i + 1}</span>
                              <span>{line}</span>
                            </div>
                          ))}
                        </pre>
                      </div>
                    )}

                    {/* Dependencies */}
                    {activeSection === 'deps' && (
                      <div className="space-y-4">
                        <div>
                          <h4 className="text-xs font-semibold text-surface-500 uppercase mb-2">{t('docs:procedureDeps', { count: example.expectedDeps.length })}</h4>
                          <div className="space-y-1">
                            {example.expectedDeps.map((dep) => (
                              <div key={`dep-${dep}`} className="flex items-center gap-2 p-2 rounded bg-surface-100">
                                <GitBranch className="w-4 h-4 text-brand-500" />
                                <span className="text-sm font-mono">{dep}</span>
                                <span className="badge-info ml-auto">{t('common:edgeTypes.calls')}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div>
                          <h4 className="text-xs font-semibold text-surface-500 uppercase mb-2">{t('docs:tableAccess', { count: example.expectedTables.length })}</h4>
                          <div className="space-y-1">
                            {example.expectedTables.map((tbl) => (
                              <div key={`tbl-${tbl}`} className="flex items-center gap-2 p-2 rounded bg-surface-100">
                                <Table2 className="w-4 h-4 text-emerald-500" />
                                <span className="text-sm font-mono">{tbl}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Security */}
                    {activeSection === 'security' && (
                      <div className="space-y-2">
                        {example.securityNotes.map((note) => (
                          <div key={`note-${note}`} className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20">
                            <Shield className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                            <span className="text-sm text-emerald-700 dark:text-emerald-400">{note}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
