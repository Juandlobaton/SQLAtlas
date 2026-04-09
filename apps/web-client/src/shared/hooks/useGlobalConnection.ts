import { useEffect } from 'react';
import { useStudioStore } from '@/shared/stores/studio.store';
import { useConnections } from './useConnections';

/**
 * Returns the global connectionId shared across all modules.
 * Auto-initializes from the first available connection if not yet set.
 *
 * When a user changes the connection in ANY page, all other pages see the update
 * because the value lives in the Zustand store, not in component state.
 */
export function useGlobalConnection() {
  const { data: connections } = useConnections();
  const connectionId = useStudioStore((s) => s.connectionId);
  const setConnectionId = useStudioStore((s) => s.setConnectionId);

  // Auto-initialize from first connection if nothing selected yet
  useEffect(() => {
    if (!connectionId && connections && connections.length > 0) {
      setConnectionId(connections[0].id);
    }
  }, [connectionId, connections, setConnectionId]);

  const activeId = connectionId || connections?.[0]?.id || null;

  return { connectionId: activeId, setConnectionId, connections: connections || [] };
}
