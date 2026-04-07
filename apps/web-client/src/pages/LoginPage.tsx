import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Database, LogIn, UserPlus } from 'lucide-react';
import { useAuthStore } from '@/shared/stores/auth.store';

export function LoginPage() {
  const { t } = useTranslation(['login', 'common']);
  const navigate = useNavigate();
  const { login, register, fetchSystemStatus, systemStatus, isLoading, error } = useAuthStore();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tenantSlug, setTenantSlug] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [tenantName, setTenantName] = useState('');

  useEffect(() => {
    if (import.meta.env.VITE_DEMO_MODE === 'true') {
      navigate('/', { replace: true });
      return;
    }
    fetchSystemStatus()
      .then((status) => {
        if (status.needsSetup) navigate('/setup', { replace: true });
      })
      .catch(() => {});
  }, [fetchSystemStatus, navigate]);

  const canRegister = systemStatus?.registrationMode === 'open';
  const showTenantSlug = systemStatus?.multiTenant ?? false;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (mode === 'login') {
        await login(email, password, showTenantSlug ? tenantSlug : undefined);
      } else {
        await register(email, password, displayName, tenantName);
      }
      navigate('/');
    } catch {
      // error is set in the store
    }
  };

  return (
    <div className="min-h-screen bg-surface-0 flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-fade-in-up">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-brand-600 flex items-center justify-center mx-auto mb-4">
            <Database className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold">{t('login:title')}</h1>
          <p className="text-surface-500 text-sm mt-1">{t('login:subtitle')}</p>
        </div>

        {/* Toggle (only if registration is open) */}
        {canRegister && (
          <div className="flex bg-surface-100 rounded-lg p-1 mb-6">
            <button
              onClick={() => setMode('login')}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                mode === 'login' ? 'bg-brand-600 text-white' : 'text-surface-500 hover:text-surface-700'
              }`}
            >
              <LogIn className="w-4 h-4 inline mr-1.5" />{t('common:auth.signIn')}
            </button>
            <button
              onClick={() => setMode('register')}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                mode === 'register' ? 'bg-brand-600 text-white' : 'text-surface-500 hover:text-surface-700'
              }`}
            >
              <UserPlus className="w-4 h-4 inline mr-1.5" />{t('common:auth.register')}
            </button>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="card p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
              {error}
            </div>
          )}

          {mode === 'register' && (
            <>
              <div>
                <label className="text-xs font-medium text-surface-500 mb-1 block">{t('common:auth.orgName')}</label>
                <input className="input" placeholder={t('common:auth.orgPlaceholder')} value={tenantName} onChange={(e) => setTenantName(e.target.value)} required />
              </div>
              <div>
                <label className="text-xs font-medium text-surface-500 mb-1 block">{t('common:auth.name')}</label>
                <input className="input" placeholder={t('common:auth.namePlaceholder')} value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
              </div>
            </>
          )}

          <div>
            <label className="text-xs font-medium text-surface-500 mb-1 block">{t('common:auth.email')}</label>
            <input className="input" type="email" placeholder="admin@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>

          <div>
            <label className="text-xs font-medium text-surface-500 mb-1 block">{t('common:auth.password')}</label>
            <input className="input" type="password" placeholder={t('common:auth.passwordPlaceholder')} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
          </div>

          {mode === 'login' && showTenantSlug && (
            <div>
              <label className="text-xs font-medium text-surface-500 mb-1 block">{t('common:auth.orgSlug')}</label>
              <input className="input" placeholder={t('common:auth.orgSlugPlaceholder')} value={tenantSlug} onChange={(e) => setTenantSlug(e.target.value)} required />
            </div>
          )}

          <button type="submit" disabled={isLoading} className="btn-primary w-full">
            {isLoading ? t('common:loading') : mode === 'login' ? t('common:auth.signIn') : t('common:auth.createAccount')}
          </button>
        </form>
      </div>
    </div>
  );
}
