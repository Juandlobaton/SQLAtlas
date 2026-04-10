import type { LucideIcon } from 'lucide-react';

interface ModuleToolbarProps {
  icon: LucideIcon;
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}

export function ModuleToolbar({ icon: Icon, title, subtitle, actions, children }: ModuleToolbarProps) {
  return (
    <>
      <div className="h-10 flex-none flex items-center justify-between px-3 border-b border-surface-200 bg-surface-50/80">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2">
            <Icon className="w-4 h-4 text-brand-500 flex-shrink-0" />
            <span className="text-sm font-semibold truncate">{title}</span>
          </div>
          {subtitle && (
            <span className="text-[10px] text-surface-400 tabular-nums hidden sm:inline">
              {subtitle}
            </span>
          )}
        </div>
        {actions && <div className="flex items-center gap-2 overflow-visible">{actions}</div>}
      </div>
      {children && (
        <div className="border-b border-surface-200 bg-surface-50">{children}</div>
      )}
    </>
  );
}
