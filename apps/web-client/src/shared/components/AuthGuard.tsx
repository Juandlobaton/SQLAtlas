import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/shared/stores/auth.store';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, restoreSession } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  useEffect(() => {
    const hasSession = localStorage.getItem('session_user');
    if (!hasSession && !isAuthenticated) {
      navigate('/login');
    }
  }, [isAuthenticated, navigate]);

  if (!isAuthenticated && !localStorage.getItem('session_user')) {
    return null;
  }

  return <>{children}</>;
}
