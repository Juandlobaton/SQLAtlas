import { cn } from '@/shared/lib/utils';

interface SidePanelProps {
  children: React.ReactNode;
  position?: 'left' | 'right';
  className?: string;
}

export function SidePanel({ children, position = 'left', className }: SidePanelProps) {
  return (
    <div
      className={cn(
        'w-72 flex-shrink-0 flex flex-col overflow-hidden',
        position === 'left' ? 'border-r border-surface-200' : 'border-l border-surface-200',
        className,
      )}
    >
      {children}
    </div>
  );
}
