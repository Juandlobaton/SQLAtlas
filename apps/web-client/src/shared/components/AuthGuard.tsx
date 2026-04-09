import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuthStore } from '@/shared/stores/auth.store';

const IS_DEMO = import.meta.env.VITE_DEMO_MODE === 'true';
const API_BASE = import.meta.env.VITE_API_BASE || '/api/v1';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, restoreSession, logout } = useAuthStore();
  const navigate = useNavigate();
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    if (IS_DEMO) {
      restoreSession();
      setVerified(true);
      return;
    }

    const hasSession = localStorage.getItem('session_user');
    if (!hasSession) {
      navigate('/login', { replace: true });
      return;
    }

    // Restore UI state optimistically
    restoreSession();

    // Verify session is still valid server-side via refresh
    fetch(`${API_BASE}/auth/refresh`, { method: 'POST', credentials: 'include' })
      .then((res) => {
        if (res.ok) {
          setVerified(true);
        } else if (res.status === 429) {
          // Rate limited — allow cached session (don't kick user out)
          setVerified(true);
        } else {
          // Session expired — clean up and redirect
          localStorage.removeItem('session_user');
          localStorage.removeItem('sqlatlas-studio');
          logout().catch(() => {});
          navigate('/login', { replace: true });
        }
      })
      .catch(() => {
        // Network error — allow offline-ish usage with cached session
        setVerified(true);
      });
  }, [restoreSession, logout, navigate]);

  if (IS_DEMO) return <>{children}</>;

  if (!verified) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-0">
        <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return <>{children}</>;
}
