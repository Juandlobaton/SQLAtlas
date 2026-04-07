import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from '@/shared/components/layout/AppShell';
import { DashboardPage } from '@/pages/DashboardPage';
import { PlaygroundPage } from '@/pages/PlaygroundPage';
import { LineagePage } from '@/pages/LineagePage';
import { ConnectionsPage } from '@/pages/ConnectionsPage';
import { DocsPage } from '@/pages/DocsPage';
import { SecurityPage } from '@/pages/SecurityPage';
import { FlowPage } from '@/pages/FlowPage';
import { TablesPage } from '@/pages/TablesPage';
import { ERDiagramPage } from '@/pages/ERDiagramPage';
import { SettingsPage } from '@/pages/SettingsPage';

export const router = createBrowserRouter([
  { path: '/login', element: <Navigate to="/" replace /> },
  { path: '/setup', element: <Navigate to="/" replace /> },
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'explorer', element: <PlaygroundPage /> },
      { path: 'explorer/:connectionId/:procedureId', element: <PlaygroundPage /> },
      { path: 'graph', element: <LineagePage /> },
      { path: 'flow', element: <FlowPage /> },
      { path: 'flow/:connectionId/:procedureId', element: <FlowPage /> },
      { path: 'connections', element: <ConnectionsPage /> },
      { path: 'tables', element: <TablesPage /> },
      { path: 'er-diagram', element: <ERDiagramPage /> },
      { path: 'security', element: <SecurityPage /> },
      { path: 'docs', element: <DocsPage /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
]);
