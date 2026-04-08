import { create } from 'zustand';

/*
 * Navigation model:
 *
 * ┌─────────┬───────────────┬──────────────────────────────────────┐
 * │Activity │  Side Panel   │  Main Area                           │
 * │  Bar    │  (module)     │                                      │
 * │         │               │  No tabs open → module default view  │
 * │ [home]  │  tree/list    │  Tabs open → tabbed object views     │
 * │ [conn]  │  of module    │                                      │
 * │ [graph] │  items        │  Tab = SP flow, table detail, etc.   │
 * │ [sec]   │               │                                      │
 * │ [set]   │               │                                      │
 * └─────────┴───────────────┴──────────────────────────────────────┘
 *
 * - Activity bar selects the active MODULE (changes side panel + default view)
 * - Side panel shows module-specific content (tree, list, search)
 * - Main area shows module DEFAULT VIEW when no tabs are open
 * - Tabs are created only when opening specific OBJECTS (SP, table, connection detail)
 */

/* ── Modules ── */

export type Module =
  | 'home'           // Dashboard
  | 'connections'    // Connection management
  | 'sql-explorer'   // PlaygroundPage — paste SQL, analyze
  | 'flow'           // FlowPage — Pipeline + Control Flow (has own sidebar)
  | 'graph'          // LineagePage — Lineage + Graph (has own sidebar)
  | 'tables'         // TablesPage (has own sidebar) + ERDiagramPage
  | 'er-diagram'     // ERDiagramPage
  | 'security'       // Security findings
  | 'docs'           // Documentation
  | 'settings';      // App settings

/* ── Object tabs (only for specific opened items) ── */

export type TabType = 'procedure' | 'table' | 'connection';

export interface StudioTab {
  id: string;
  type: TabType;
  label: string;
  // Procedure
  procedureId?: string;
  connectionId?: string;
  schemaName?: string;
  objectType?: string;
  // Table
  tableId?: string;
}

/* ── Store ── */

interface StudioState {
  activeModule: Module;
  tabs: StudioTab[];
  activeTabId: string | null;  // null = show module default view

  // Global context (shared across ALL modules)
  connectionId: string | null;
  setConnectionId: (id: string | null) => void;

  // Per-module persisted state (survives module switches)
  moduleState: Record<string, Record<string, unknown>>;
  setModuleState: (module: string, key: string, value: unknown) => void;

  setModule: (module: Module) => void;
  openTab: (tab: StudioTab) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string | null) => void;
}

export const useStudioStore = create<StudioState>((set, get) => ({
  activeModule: 'home',
  tabs: [],
  activeTabId: null,
  connectionId: null,
  moduleState: {},

  setConnectionId: (id) => set({ connectionId: id }),

  setModuleState: (module, key, value) => set((state) => ({
    moduleState: {
      ...state.moduleState,
      [module]: { ...state.moduleState[module], [key]: value },
    },
  })),

  setModule: (module) => set({ activeModule: module, activeTabId: null }),

  openTab: (tab) => {
    const { tabs } = get();
    const existing = tabs.find((t) => t.id === tab.id);
    if (existing) {
      set({ activeTabId: tab.id });
    } else {
      set({ tabs: [...tabs, tab], activeTabId: tab.id });
    }
  },

  closeTab: (id) => {
    const { tabs, activeTabId } = get();
    const filtered = tabs.filter((t) => t.id !== id);
    let newActive = activeTabId;
    if (activeTabId === id) {
      const idx = tabs.findIndex((t) => t.id === id);
      newActive = filtered[Math.min(idx, filtered.length - 1)]?.id ?? null;
    }
    set({ tabs: filtered, activeTabId: newActive });
  },

  setActiveTab: (id) => set({ activeTabId: id }),
}));
