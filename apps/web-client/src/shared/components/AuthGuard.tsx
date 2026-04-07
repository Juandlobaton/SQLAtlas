import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/shared/stores/auth.store';

const IS_DEMO = import.meta.env.VITE_DEMO_MODE === 'true';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, restoreSession } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  useEffect(() => {
    if (IS_DEMO) return;
    const hasSession = localStorage.getItem('session_user');
    if (!hasSession && !isAuthenticated) {
      navigate('/login');
    }
  }, [isAuthenticated, navigate]);

  if (IS_DEMO) return <>{children}</>;

  if (!isAuthenticated && !localStorage.getItem('session_user')) {
    return null;
  }

  return <>{children}</>;
}
