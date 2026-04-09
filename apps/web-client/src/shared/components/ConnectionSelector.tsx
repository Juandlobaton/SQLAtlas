import { useGlobalConnection } from '@/shared/hooks/useGlobalConnection';
import { cn } from '@/shared/lib/utils';

interface ConnectionSelectorProps {
  className?: string;
  onConnectionChange?: () => void;
}

export function ConnectionSelector({ className, onConnectionChange }: ConnectionSelectorProps) {
  const { connectionId, setConnectionId, connections } = useGlobalConnection();

  if (!connections.length) return null;

  return (
    <select
      value={connectionId || ''}
      onChange={(e) => {
        setConnectionId(e.target.value || null);
        onConnectionChange?.();
      }}
      className={cn('input w-44 text-xs h-7', className)}
    >
      {connections.map((c: any) => (
        <option key={c.id} value={c.id}>{c.name}</option>
      ))}
    </select>
  );
}
