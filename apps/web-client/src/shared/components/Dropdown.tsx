import { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

export interface DropdownOption {
  value: string;
  label: string;
  subtitle?: string;
  icon?: React.ReactNode;
}

interface DropdownProps {
  value: string | null;
  options: DropdownOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  size?: 'sm' | 'md';
}

export function Dropdown({ value, options, onChange, placeholder = 'Select...', className, size = 'sm' }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = options.find(o => o.value === value);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') setOpen(false);
  }, []);

  return (
    <div ref={ref} className={cn('relative', className)} onKeyDown={handleKeyDown}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center gap-2 rounded-lg border border-surface-200 bg-surface-0 dark:bg-surface-900',
          'hover:border-surface-300 dark:hover:border-surface-600 transition-colors cursor-pointer',
          'text-left w-full',
          size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-9 px-3 text-sm',
          open && 'border-brand-400 ring-1 ring-brand-400/30',
        )}
      >
        {selected?.icon && <span className="flex-shrink-0">{selected.icon}</span>}
        <span className="flex-1 truncate text-surface-800 dark:text-surface-200">
          {selected?.label || <span className="text-surface-400">{placeholder}</span>}
        </span>
        <ChevronDown className={cn('w-3.5 h-3.5 text-surface-400 flex-shrink-0 transition-transform', open && 'rotate-180')} />
      </button>

      {/* Menu */}
      {open && (
        <div className={cn(
          'absolute z-50 mt-1 w-full min-w-[180px] max-h-[280px] overflow-y-auto',
          'rounded-lg border border-surface-200 dark:border-surface-700',
          'bg-surface-0 dark:bg-surface-900 shadow-lg',
          'animate-fade-in',
          // Position: prefer below, but flip if near bottom
          'right-0',
        )}>
          {options.map(opt => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className={cn(
                  'w-full flex items-center gap-2 px-3 text-left transition-colors cursor-pointer',
                  size === 'sm' ? 'py-2 text-xs' : 'py-2.5 text-sm',
                  isSelected
                    ? 'bg-brand-50 dark:bg-brand-950/30 text-brand-600 dark:text-brand-400'
                    : 'text-surface-700 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800',
                )}
              >
                {opt.icon && <span className="flex-shrink-0">{opt.icon}</span>}
                <div className="flex-1 min-w-0">
                  <p className="truncate font-medium">{opt.label}</p>
                  {opt.subtitle && <p className="text-[10px] text-surface-400 truncate">{opt.subtitle}</p>}
                </div>
                {isSelected && <Check className="w-3.5 h-3.5 text-brand-500 flex-shrink-0" />}
              </button>
            );
          })}
          {options.length === 0 && (
            <p className="px-3 py-4 text-xs text-surface-400 text-center">No options</p>
          )}
        </div>
      )}
    </div>
  );
}
