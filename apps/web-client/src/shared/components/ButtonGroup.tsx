import type { LucideIcon } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

interface ButtonGroupOption<T extends string> {
  id: T;
  label: string;
  icon?: LucideIcon;
  title?: string;
}

interface ButtonGroupProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: ButtonGroupOption<T>[];
  size?: 'sm' | 'md';
}

export function ButtonGroup<T extends string>({ value, onChange, options, size = 'sm' }: ButtonGroupProps<T>) {
  return (
    <div className="flex bg-surface-100 rounded-md p-0.5">
      {options.map(({ id, label, icon: Icon, title }) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          title={title}
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1 rounded font-medium transition-all whitespace-nowrap',
            size === 'sm' ? 'text-[11px]' : 'text-xs',
            value === id
              ? 'bg-brand-600 text-white shadow-sm'
              : 'text-surface-500 hover:text-surface-700',
          )}
        >
          {Icon && <Icon className="w-3.5 h-3.5" />}
          {label}
        </button>
      ))}
    </div>
  );
}
