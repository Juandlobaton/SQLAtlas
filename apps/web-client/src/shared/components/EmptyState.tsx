import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
}

export function EmptyState({ icon: Icon, title, description }: EmptyStateProps) {
  return (
    <div className="flex items-center justify-center h-full text-surface-400">
      <div className="text-center">
        <Icon className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p className="text-sm font-medium">{title}</p>
        {description && <p className="text-xs mt-1">{description}</p>}
      </div>
    </div>
  );
}
