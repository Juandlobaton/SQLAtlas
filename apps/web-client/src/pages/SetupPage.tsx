import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Database, Shield, Building2 } from 'lucide-react';
import { useAuthStore } from '@/shared/stores/auth.store';

export function SetupPage() {
  const { t } = useTranslation(['common']);
  const navigate = useNavigate();
  const { setup, fetchSystemStatus, isLoading, error } = useAuthStore();
  const [alreadySetup, setAlreadySetup] = useState(false);
  const [checking, setChecking] = useState(true);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [orgName, setOrgName] = useState('');

  useEffect(() => {
    fetchSystemStatus()
      .then((status) => {
        if (!status.needsSetup) setAlreadySetup(true);
      })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, [fetchSystemStatus]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await setup(email, password, displayName, orgName);
      navigate('/');
    } catch {
      // error is in the store
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-surface-0 flex items-center justify-center">
        <div className="animate-pulse text-surface-400">{t('common:loading')}</div>
      </div>
    );
  }

  if (alreadySetup) {
    return (
      <div className="min-h-screen bg-surface-0 flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center animate-fade-in-up">
          <div className="w-14 h-14 rounded-2xl bg-emerald-600 flex items-center justify-center mx-auto mb-4">
            <Shield className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold mb-2">{t('common:setup.alreadySetup')}</h1>
          <button onClick={() => navigate('/login')} className="btn-primary mt-4">
            {t('common:setup.goToLogin')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-0 flex items-center justify-center p-4">
      <div className="w-full max-w-lg animate-fade-in-up">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-brand-600 flex items-center justify-center mx-auto mb-4">
            <Database className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold">{t('common:setup.welcome')}</h1>
          <p className="text-surface-500 text-sm mt-1">{t('common:setup.description')}</p>
        </div>

        <form onSubmit={handleSubmit} className="card p-6 space-y-6">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
              {error}
            </div>
          )}

          {/* Organization */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Building2 className="w-4 h-4 text-brand-600" />
              <span className="text-sm font-semibold">{t('common:setup.orgSection')}</span>
            </div>
            <div>
              <label className="text-xs font-medium text-surface-500 mb-1 block">{t('common:auth.orgName')}</label>
              <input
                className="input"
                placeholder={t('common:auth.orgPlaceholder')}
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                required
                minLength={2}
              />
            </div>
          </div>

          {/* Admin Account */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Shield className="w-4 h-4 text-brand-600" />
              <span className="text-sm font-semibold">{t('common:setup.adminSection')}</span>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-surface-500 mb-1 block">{t('common:auth.name')}</label>
                <input
                  className="input"
                  placeholder={t('common:auth.namePlaceholder')}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                  minLength={2}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-surface-500 mb-1 block">{t('common:auth.email')}</label>
                <input
                  className="input"
                  type="email"
                  placeholder={t('common:auth.emailPlaceholder') || 'admin@example.com'}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="text-xs font-medium text-surface-500 mb-1 block">{t('common:auth.password')}</label>
                <input
                  className="input"
                  type="password"
                  placeholder={t('common:auth.passwordPlaceholder')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                />
                <p className="text-xs text-surface-400 mt-1">
                  {t('common:auth.passwordPlaceholder')}. A-Z, a-z, 0-9, @$!%*?&#
                </p>
              </div>
            </div>
          </div>

          <button type="submit" disabled={isLoading} className="btn-primary w-full">
            {isLoading ? t('common:setup.completing') : t('common:setup.complete')}
          </button>
        </form>
      </div>
    </div>
  );
}
