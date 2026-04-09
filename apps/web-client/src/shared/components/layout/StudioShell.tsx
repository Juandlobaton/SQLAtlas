import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Database, Shield, Settings, X, Loader2,
  LayoutDashboard, Network, Table2, FileText, Waypoints,
  Moon, Sun, LogOut, Code2, GitBranch, Workflow,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useStudioStore, type Module, type StudioTab } from '@/shared/stores/studio.store';
import { useAuthStore } from '@/shared/stores/auth.store';

/* ── Lazy page imports (ALL pages) ── */
const DashboardPage = lazy(() => import('@/pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const ConnectionsPage = lazy(() => import('@/pages/ConnectionsPage').then((m) => ({ default: m.ConnectionsPage })));
const PlaygroundPage = lazy(() => import('@/pages/PlaygroundPage').then((m) => ({ default: m.PlaygroundPage })));
const FlowPage = lazy(() => import('@/pages/FlowPage').then((m) => ({ default: m.FlowPage })));
const LineagePage = lazy(() => import('@/pages/LineagePage').then((m) => ({ default: m.LineagePage })));
const TablesPage = lazy(() => import('@/pages/TablesPage').then((m) => ({ default: m.TablesPage })));
const ERDiagramPage = lazy(() => import('@/pages/ERDiagramPage').then((m) => ({ default: m.ERDiagramPage })));
const SecurityPage = lazy(() => import('@/pages/SecurityPage').then((m) => ({ default: m.SecurityPage })));
const DocsPage = lazy(() => import('@/pages/DocsPage').then((m) => ({ default: m.DocsPage })));
const SettingsPage = lazy(() => import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const ProcedureTabContent = lazy(() => import('@/features/studio/components/ProcedureTab').then((m) => ({ default: m.ProcedureTab })));

/* ── Module config ──
 * fullWidth: true = page has its own sidebar, fills entire main area
 * fullWidth: false = page is simple content, may get padding wrapper
 */
const MODULES: { id: Module; icon: typeof Database; labelKey: string; fullWidth: boolean }[] = [
  { id: 'home',          icon: LayoutDashboard, labelKey: 'nav:dashboard',     fullWidth: false },
  { id: 'connections',   icon: Database,        labelKey: 'nav:connections',   fullWidth: false },
  { id: 'sql-explorer',  icon: Code2,           labelKey: 'nav:sqlExplorer',   fullWidth: true },
  { id: 'flow',          icon: GitBranch,       labelKey: 'nav:flowAnalysis',  fullWidth: true },
  { id: 'graph',         icon: Network,         labelKey: 'nav:dataLineage',   fullWidth: true },
  { id: 'tables',        icon: Table2,          labelKey: 'nav:tables',        fullWidth: true },
  { id: 'er-diagram',    icon: Workflow,        labelKey: 'nav:erDiagram',     fullWidth: true },
  { id: 'security',      icon: Shield,          labelKey: 'nav:security',      fullWidth: true },
  { id: 'docs',          icon: FileText,        labelKey: 'nav:documentation', fullWidth: false },
  { id: 'settings',      icon: Settings,        labelKey: 'nav:settings',      fullWidth: false },
];

const TAB_TYPE_ICON: Record<string, typeof Database> = {
  procedure: Waypoints, table: Table2, connection: Database,
};

import { useTheme } from '@/shared/hooks/useTheme';

/* ═══ Main Shell ═══ */

export function StudioShell() {
  const { t } = useTranslation(['nav', 'common']);
  const { activeModule, tabs, activeTabId, setModule, closeTab, setActiveTab } = useStudioStore();
  const { user, logout } = useAuthStore();
  const { theme, toggle: toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  const showingTab = activeTabId !== null;
  const activeTab = tabs.find((tab) => tab.id === activeTabId);
  const moduleConfig = MODULES.find((m) => m.id === activeModule);

  /* ── Module default view renderer ── */
  function renderModuleView() {
    const wrap = (el: React.ReactNode) => <div className="p-6 h-full overflow-y-auto">{el}</div>;

    switch (activeModule) {
      case 'home':         return wrap(<DashboardPage />);
      case 'connections':  return wrap(<ConnectionsPage />);
      case 'sql-explorer': return <PlaygroundPage />;
      case 'flow':         return <FlowPage />;
      case 'graph':        return <LineagePage />;
      case 'tables':       return <TablesPage />;
      case 'er-diagram':   return <ERDiagramPage />;
      case 'security':     return <SecurityPage />;
      case 'docs':         return wrap(<DocsPage />);
      case 'settings':     return wrap(<SettingsPage />);
      default:             return null;
    }
  }

  /* ── Tab content renderer ── */
  function renderTab(tab: StudioTab) {
    if (tab.type === 'procedure' && tab.procedureId && tab.connectionId) {
      return <ProcedureTabContent procedureId={tab.procedureId} connectionId={tab.connectionId} defaultView={tab.defaultView} />;
    }
    return <div className="p-6 text-surface-400">{tab.label}</div>;
  }

  return (
    <div className="h-screen w-screen overflow-hidden flex bg-surface-0 text-surface-900">

      {/* ═══ Activity Bar ═══ */}
      <aside className="w-12 flex-none flex flex-col items-center bg-surface-100 border-r border-surface-200">
        {/* Logo */}
        <div className="h-11 w-full flex items-center justify-center">
          <div className="w-7 h-7 rounded-lg bg-brand-600 flex items-center justify-center shadow-sm">
            <Database className="w-3.5 h-3.5 text-white" />
          </div>
        </div>

        {/* Module icons */}
        <nav className="flex-1 flex flex-col items-center gap-0.5 pt-1 overflow-y-auto">
          {MODULES.map(({ id, icon: Icon, labelKey }) => (
            <button
              key={id}
              onClick={() => setModule(id)}
              className={cn(
                'w-10 h-10 flex items-center justify-center rounded-lg transition-colors relative flex-shrink-0',
                activeModule === id ? 'text-brand-500' : 'text-surface-400 hover:text-surface-600 hover:bg-surface-200/60',
              )}
              title={t(labelKey, { defaultValue: id })}
            >
              {activeModule === id && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-brand-500 rounded-r" />}
              <Icon className="w-[18px] h-[18px]" />
            </button>
          ))}
        </nav>

        {/* Bottom actions */}
        <div className="flex flex-col items-center gap-1 pb-3 pt-2 border-t border-surface-200">
          <button onClick={toggleTheme} title={t('common:theme', { defaultValue: 'Theme' })}
            className="w-10 h-10 flex items-center justify-center rounded-lg text-surface-400 hover:text-surface-600 hover:bg-surface-200/60 transition-colors">
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white text-xs font-bold" title={user?.email || ''}>
            {(user?.email || '?')[0].toUpperCase()}
          </div>
          <button onClick={() => logout()} title={t('common:auth.logout', { defaultValue: 'Logout' })}
            className="w-10 h-10 flex items-center justify-center rounded-lg text-surface-400 hover:text-red-500 transition-colors">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* ═══ Main Area ═══ */}
      <div className="flex-1 min-w-0 flex flex-col">

        {/* Tab bar — only shows when object tabs are open */}
        {tabs.length > 0 && (
          <div className="h-9 flex-none flex items-end bg-surface-100 border-b border-surface-200 overflow-x-auto">
            {/* Module "home" tab — click to return to module default view */}
            <button
              onClick={() => setActiveTab(null)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-[11px] cursor-pointer border-b-2 -mb-px whitespace-nowrap transition-colors flex-shrink-0',
                !showingTab
                  ? 'bg-surface-0 text-surface-800 border-brand-500'
                  : 'text-surface-500 hover:text-surface-700 border-transparent hover:bg-surface-50',
              )}
            >
              {moduleConfig && (() => { const MIcon = moduleConfig.icon; return <MIcon className="w-3.5 h-3.5" />; })()}
              <span className="font-medium">{t(moduleConfig?.labelKey || 'nav:dashboard', { defaultValue: activeModule })}</span>
            </button>

            {/* Object tabs */}
            {tabs.map((tab) => {
              const Icon = TAB_TYPE_ICON[tab.type] || FileText;
              const isActive = activeTabId === tab.id;
              return (
                <div
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'group flex items-center gap-1.5 px-3 py-1.5 text-[11px] cursor-pointer min-w-0 max-w-[200px] border-b-2 -mb-px whitespace-nowrap transition-colors',
                    isActive
                      ? 'bg-surface-0 text-surface-800 border-brand-500'
                      : 'text-surface-500 hover:text-surface-700 border-transparent hover:bg-surface-50',
                  )}
                >
                  <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate font-medium">{tab.label}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                    className={cn(
                      'p-0.5 rounded hover:bg-surface-200 flex-shrink-0 transition-opacity',
                      isActive ? 'opacity-60 hover:opacity-100' : 'opacity-0 group-hover:opacity-60',
                    )}
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Content area */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <Suspense fallback={<div className="flex items-center justify-center h-full"><Loader2 className="w-5 h-5 animate-spin text-brand-500" /></div>}>
            {showingTab && activeTab
              ? renderTab(activeTab)
              : renderModuleView()
            }
          </Suspense>
        </div>
      </div>
    </div>
  );
}
