import { createBrowserRouter } from 'react-router-dom';
import { AuthGuard } from '@/shared/components/AuthGuard';
import { StudioShell } from '@/shared/components/layout/StudioShell';
import { LoginPage } from '@/pages/LoginPage';
import { SetupPage } from '@/pages/SetupPage';

export const router = createBrowserRouter([
  { path: '/setup', element: <SetupPage /> },
  { path: '/login', element: <LoginPage /> },
  {
    path: '/*',
    element: <AuthGuard><StudioShell /></AuthGuard>,
  },
]);
