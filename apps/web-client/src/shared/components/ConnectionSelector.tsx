import { useMemo } from 'react';
import { Database } from 'lucide-react';
import { useGlobalConnection } from '@/shared/hooks/useGlobalConnection';
import { Dropdown, type DropdownOption } from './Dropdown';
import { cn } from '@/shared/lib/utils';

const ENGINE_LABEL: Record<string, string> = {
  sqlserver: 'SQL Server',
  postgresql: 'PostgreSQL',
  oracle: 'Oracle',
};

interface ConnectionSelectorProps {
  className?: string;
  onConnectionChange?: () => void;
}

export function ConnectionSelector({ className, onConnectionChange }: ConnectionSelectorProps) {
  const { connectionId, setConnectionId, connections } = useGlobalConnection();

  const options: DropdownOption[] = useMemo(() =>
    connections.map((c: any) => ({
      value: c.id,
      label: c.name,
      subtitle: ENGINE_LABEL[c.engine] || c.engine,
      icon: <Database className="w-3.5 h-3.5 text-surface-400" />,
    })),
    [connections],
  );

  if (!connections.length) return null;

  return (
    <Dropdown
      value={connectionId}
      options={options}
      onChange={(v) => { setConnectionId(v); onConnectionChange?.(); }}
      placeholder="Select connection..."
      className={cn('w-[220px]', className)}
    />
  );
}
