import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AuthGuard } from '@/shared/components/AuthGuard';
import { StudioShell } from '@/shared/components/layout/StudioShell';

export const router = createBrowserRouter([
  { path: '/login', element: <Navigate to="/" replace /> },
  { path: '/setup', element: <Navigate to="/" replace /> },
  {
    path: '/*',
    element: <AuthGuard><StudioShell /></AuthGuard>,
  },
]);
