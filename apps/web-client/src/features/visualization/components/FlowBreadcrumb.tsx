import { ChevronRight, Home } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/shared/lib/utils';

export interface BreadcrumbItem {
  id: string;
  name: string;
  schema: string;
}

interface Props {
  items: BreadcrumbItem[];
  onNavigate: (index: number) => void;
}

export function FlowBreadcrumb({ items, onNavigate }: Props) {
  const { t } = useTranslation('flow');

  if (items.length === 0) return null;

  return (
    <div className="flex items-center gap-1 px-3 py-2 mb-3 rounded-lg bg-surface-100/60 border border-surface-200/40 overflow-x-auto">
      <button
        onClick={() => onNavigate(-1)}
        className="flex items-center gap-1 text-2xs text-surface-500 hover:text-brand-500 transition-colors flex-shrink-0 cursor-pointer"
        title={t('breadcrumb.root')}
      >
        <Home className="w-3 h-3" />
        <span className="font-medium">{t('breadcrumb.root')}</span>
      </button>

      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <div key={item.id} className="flex items-center gap-1 flex-shrink-0">
            <ChevronRight className="w-3 h-3 text-surface-300" />
            <button
              onClick={() => !isLast && onNavigate(i)}
              className={cn(
                'text-2xs font-mono transition-colors',
                isLast
                  ? 'text-brand-500 font-bold cursor-default'
                  : 'text-surface-500 hover:text-brand-500 cursor-pointer',
              )}
              title={`${item.schema}.${item.name}`}
            >
              <span className="text-surface-400">{item.schema}.</span>
              {item.name}
            </button>
          </div>
        );
      })}
    </div>
  );
}
