import { useCallback } from 'react';
import { useStudioStore, type StudioTab } from '@/shared/stores/studio.store';
import { useGlobalConnection } from './useGlobalConnection';

/**
 * Returns a callback that opens a procedure as a StudioShell tab.
 * Use this from any page (FlowPage, LineagePage, NodeDetailPanel, etc.)
 * to open a procedure in the tabbed view.
 */
export function useOpenProcedureTab() {
  const { openTab } = useStudioStore();
  const { connectionId } = useGlobalConnection();

  return useCallback(
    (proc: {
      id: string;
      objectName: string;
      schemaName: string;
      objectType: string;
    }, defaultView?: StudioTab['defaultView']) => {
      if (!connectionId) return;
      openTab({
        id: `proc-${proc.id}`,
        type: 'procedure',
        label: proc.objectName,
        procedureId: proc.id,
        connectionId,
        schemaName: proc.schemaName,
        objectType: proc.objectType,
        defaultView,
      });
    },
    [openTab, connectionId],
  );
}
