import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Database, GitBranch, LayoutDashboard, Network, FileText, Waypoints,
  Shield, Settings, PanelLeftClose, PanelLeft, Code2, Table2, Workflow,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';

const NAV_ITEMS = [
  { path: '/', icon: LayoutDashboard, labelKey: 'dashboard', shortcut: 'D' },
  { path: '/connections', icon: Database, labelKey: 'connections', shortcut: 'C' },
  { path: '/graph', icon: Network, labelKey: 'dataLineage', shortcut: 'L' },
  { path: '/explorer', icon: Code2, labelKey: 'sqlExplorer', shortcut: 'E' },
  { path: '/flow', icon: GitBranch, labelKey: 'flowAnalysis', shortcut: 'F' },
  { path: '/studio', icon: Waypoints, labelKey: 'pipelineStudio', shortcut: 'P' },
  { path: '/tables', icon: Table2, labelKey: 'tables', shortcut: 'T' },
  { path: '/er-diagram', icon: Workflow, labelKey: 'erDiagram', shortcut: 'R' },
  { path: '/security', icon: Shield, labelKey: 'security', shortcut: 'S' },
  { path: '/docs', icon: FileText, labelKey: 'documentation', shortcut: '?' },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const { t } = useTranslation();
  const { t: tNav } = useTranslation('nav');

  return (
    <aside className={cn(
      'flex flex-col h-screen border-r border-surface-200/60 bg-surface-50/80 backdrop-blur-sm transition-all duration-300 ease-out',
      collapsed ? 'w-14' : 'w-56',
    )}>
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-3 h-12 border-b border-surface-200/60">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center flex-shrink-0 shadow-sm shadow-brand-500/20">
          <Database className="w-3.5 h-3.5 text-white" />
        </div>
        {!collapsed && (
          <div className="flex flex-col">
            <span className="font-bold text-xs tracking-tight leading-none">{t('appName')}</span>
            <span className="text-2xs text-surface-500 leading-none mt-0.5">{t('tagline')}</span>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-2 px-1.5 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(({ path, icon: Icon, labelKey, shortcut }) => {
          const label = tNav(labelKey);
          const active = location.pathname === path ||
            (path !== '/' && location.pathname.startsWith(path));
          return (
            <Link key={path} to={path} title={collapsed ? label : undefined}
              className={cn(
                'group flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-150',
                active
                  ? 'bg-brand-600/12 text-brand-500 shadow-sm shadow-brand-500/5'
                  : 'text-surface-500 hover:bg-surface-100/80 hover:text-surface-800',
              )}>
              <Icon className={cn('w-4 h-4 flex-shrink-0 transition-colors', active && 'text-brand-500')} strokeWidth={active ? 2.5 : 2} />
              {!collapsed && (
                <>
                  <span className="flex-1">{label}</span>
                  <kbd className="hidden group-hover:inline text-2xs text-surface-400 bg-surface-200/50 px-1 py-0.5 rounded font-mono">{shortcut}</kbd>
                </>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="border-t border-surface-200/60 py-2 px-1.5 space-y-0.5">
        <Link to="/settings" title={collapsed ? tNav('settings') : undefined}
          className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[13px] text-surface-500 hover:bg-surface-100/80 hover:text-surface-800 transition-all duration-150">
          <Settings className="w-4 h-4 flex-shrink-0" strokeWidth={2} />
          {!collapsed && <span>{tNav('settings')}</span>}
        </Link>
        <button onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[13px] text-surface-400 hover:bg-surface-100/80 w-full transition-all duration-150 cursor-pointer">
          {collapsed
            ? <PanelLeft className="w-4 h-4" strokeWidth={2} />
            : <PanelLeftClose className="w-4 h-4" strokeWidth={2} />
          }
          {!collapsed && <span className="text-surface-400">{t('collapse')}</span>}
        </button>
      </div>
    </aside>
  );
}
