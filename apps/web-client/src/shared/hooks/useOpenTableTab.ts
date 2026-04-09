import { useCallback } from 'react';
import { useStudioStore } from '@/shared/stores/studio.store';
import { useGlobalConnection } from './useGlobalConnection';

/**
 * Returns a callback that opens a table as a StudioShell tab.
 */
export function useOpenTableTab() {
  const { openTab } = useStudioStore();
  const { connectionId } = useGlobalConnection();

  return useCallback(
    (table: { id: string; tableName: string }) => {
      if (!connectionId) return;
      openTab({
        id: `table-${table.id}`,
        type: 'table',
        label: table.tableName,
        tableId: table.id,
        connectionId,
      });
    },
    [openTab, connectionId],
  );
}
