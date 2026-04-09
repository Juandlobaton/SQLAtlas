import type { LucideIcon } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

interface PageTab<T extends string> {
  id: T;
  label: string;
  icon?: LucideIcon;
  badge?: string;
}

interface PageTabsProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  tabs: PageTab<T>[];
}

export function PageTabs<T extends string>({ value, onChange, tabs }: PageTabsProps<T>) {
  return (
    <div className="flex border-b border-surface-200/60">
      {tabs.map(({ id, label, icon: Icon, badge }) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={cn(
            'px-3 py-2 text-xs font-medium border-b-2 transition-colors',
            value === id
              ? 'border-brand-500 text-brand-600'
              : 'border-transparent text-surface-500 hover:text-surface-700',
          )}
        >
          {Icon && <Icon className="w-3.5 h-3.5 inline mr-1.5" />}
          {label}
          {badge && (
            <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded-full bg-surface-200 text-surface-600">
              {badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
