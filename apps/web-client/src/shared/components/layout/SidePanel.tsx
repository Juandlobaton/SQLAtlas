import { useState, useRef, useCallback } from 'react';
import { PanelLeftClose, PanelLeftOpen, Pin } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

interface SidePanelProps {
  children: React.ReactNode;
  position?: 'left' | 'right';
  className?: string;
  defaultCollapsed?: boolean;
}

export function SidePanel({ children, position = 'left', className, defaultCollapsed = false }: SidePanelProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [pinned, setPinned] = useState(!defaultCollapsed);
  const [hovered, setHovered] = useState(false);
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isVisible = !collapsed || hovered;

  const handleMouseEnter = useCallback(() => {
    if (!collapsed) return;
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    hoverTimeout.current = setTimeout(() => setHovered(true), 150);
  }, [collapsed]);

  const handleMouseLeave = useCallback(() => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    if (!pinned) setHovered(false);
  }, [pinned]);

  const handlePin = useCallback(() => {
    setPinned(true);
    setCollapsed(false);
    setHovered(false);
  }, []);

  const handleCollapse = useCallback(() => {
    setPinned(false);
    setCollapsed(true);
    setHovered(false);
  }, []);

  const isLeft = position === 'left';

  return (
    <div
      className="relative flex-shrink-0 h-full"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Collapsed trigger strip */}
      {collapsed && !hovered && (
        <div
          className={cn(
            'w-5 h-full flex flex-col items-center justify-center cursor-pointer',
            'bg-surface-100/50 dark:bg-surface-800/50 hover:bg-brand-50 dark:hover:bg-brand-950/30 transition-colors',
            isLeft ? 'border-r border-surface-200 dark:border-surface-700' : 'border-l border-surface-200 dark:border-surface-700',
          )}
          onClick={() => setHovered(true)}
        >
          <PanelLeftOpen className={cn('w-3 h-3 text-surface-400', !isLeft && 'rotate-180')} />
        </div>
      )}

      {/* Panel content */}
      {isVisible && (
        <div
          className={cn(
            'w-72 h-full flex flex-col overflow-hidden',
            'bg-surface-0 dark:bg-surface-900',
            isLeft
              ? 'border-r border-surface-200 dark:border-surface-700'
              : 'border-l border-surface-200 dark:border-surface-700',
            collapsed && hovered && 'absolute top-0 z-40 shadow-2xl',
            collapsed && hovered && (isLeft ? 'left-0' : 'right-0'),
            className,
          )}
        >
          {/* Panel body */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {children}
          </div>

          {/* Bottom bar: pin / collapse */}
          <div className={cn(
            'h-8 flex-none flex items-center justify-between px-2',
            'border-t',
            collapsed && hovered
              ? 'bg-brand-50 dark:bg-brand-950/40 border-brand-200 dark:border-brand-800'
              : 'bg-surface-50 dark:bg-surface-800 border-surface-200 dark:border-surface-700',
          )}>
            {collapsed && hovered ? (
              <>
                <span className="text-[10px] text-brand-500 font-medium">Hover preview</span>
                <button
                  onClick={handlePin}
                  className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-brand-500 text-white hover:bg-brand-600 transition-colors cursor-pointer"
                  title="Pin panel open"
                >
                  <Pin className="w-2.5 h-2.5" /> Pin
                </button>
              </>
            ) : (
              <>
                <span className="text-[10px] text-surface-400" />
                <button
                  onClick={handleCollapse}
                  className="p-1 rounded hover:bg-surface-200 dark:hover:bg-surface-700 text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 transition-colors cursor-pointer"
                  title="Collapse panel"
                >
                  <PanelLeftClose className={cn('w-3.5 h-3.5', !isLeft && 'rotate-180')} />
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
