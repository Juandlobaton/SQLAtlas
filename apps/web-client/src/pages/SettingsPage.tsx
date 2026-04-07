import { useState, useEffect } from 'react';
import { Settings, User, Shield, Monitor, CheckCircle, XCircle, Moon, Sun, Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/shared/lib/utils';
import { useAuthStore } from '@/shared/stores/auth.store';
import { useTheme } from '@/shared/hooks/useTheme';
import { parserApi } from '@/shared/lib/api-client';

export function SettingsPage() {
  const { user } = useAuthStore();
  const { theme, toggle } = useTheme();
  const { t, i18n } = useTranslation(['settings', 'common']);
  const [parserStatus, setParserStatus] = useState<'checking' | 'healthy' | 'down'>('checking');
  const [apiStatus, setApiStatus] = useState<'checking' | 'healthy' | 'down'>('checking');
  const [dialects, setDialects] = useState<string[]>([]);

  useEffect(() => {
    parserApi.health()
      .then((r) => { setParserStatus(r.status === 'healthy' ? 'healthy' : 'down'); })
      .catch(() => setParserStatus('down'));

    fetch('/api/v1/health').then((r) => r.ok ? setApiStatus('healthy') : setApiStatus('down')).catch(() => setApiStatus('down'));

    parserApi.dialects()
      .then((r) => setDialects(r.dialects || []))
      .catch(() => {});
  }, []);

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Settings className="w-6 h-6 text-brand-500" />
          {t('settings:title')}
        </h1>
        <p className="text-surface-500 text-sm mt-1">{t('settings:subtitle')}</p>
      </div>

      {/* Profile */}
      <div className="card p-5">
        <h3 className="font-semibold text-sm flex items-center gap-2 mb-4">
          <User className="w-4 h-4 text-surface-400" /> {t('settings:profile.title')}
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-surface-500 mb-1">{t('settings:profile.email')}</p>
            <p className="text-sm font-medium">{user?.email || '-'}</p>
          </div>
          <div>
            <p className="text-xs text-surface-500 mb-1">{t('settings:profile.role')}</p>
            <span className="badge-info capitalize">{user?.role || '-'}</span>
          </div>
          <div>
            <p className="text-xs text-surface-500 mb-1">{t('settings:profile.tenantId')}</p>
            <p className="text-xs font-mono text-surface-600">{user?.tenantId || '-'}</p>
          </div>
          <div>
            <p className="text-xs text-surface-500 mb-1">{t('settings:profile.userId')}</p>
            <p className="text-xs font-mono text-surface-600">{user?.sub || '-'}</p>
          </div>
        </div>
      </div>

      {/* Theme */}
      <div className="card p-5">
        <h3 className="font-semibold text-sm flex items-center gap-2 mb-4">
          <Monitor className="w-4 h-4 text-surface-400" /> {t('settings:appearance.title')}
        </h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm">{t('common:theme.label')}</p>
            <p className="text-xs text-surface-500">{t('settings:appearance.themeDescription')}</p>
          </div>
          <button onClick={toggle} className={cn('btn-secondary text-xs gap-2',
            theme === 'dark' ? 'bg-surface-700 text-white' : '')}>
            {theme === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            {theme === 'dark' ? t('common:theme.dark') : t('common:theme.light')}
          </button>
        </div>
      </div>

      {/* Language */}
      <div className="card p-5">
        <h3 className="font-semibold text-sm flex items-center gap-2 mb-4">
          <Globe className="w-4 h-4 text-surface-400" /> {t('language.title')}
        </h3>
        <p className="text-xs text-surface-500 mb-3">{t('language.description')}</p>
        <div className="flex gap-2">
          <button
            onClick={() => i18n.changeLanguage('es')}
            className={`px-3 py-1.5 rounded text-sm ${i18n.language === 'es' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'}`}
          >
            {t('language.es')}
          </button>
          <button
            onClick={() => i18n.changeLanguage('pt')}
            className={`px-3 py-1.5 rounded text-sm ${i18n.language === 'pt' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'}`}
          >
            {t('language.pt')}
          </button>
          <button
            onClick={() => i18n.changeLanguage('en')}
            className={`px-3 py-1.5 rounded text-sm ${i18n.language === 'en' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'}`}
          >
            {t('language.en')}
          </button>
        </div>
      </div>

      {/* Service Health */}
      <div className="card p-5">
        <h3 className="font-semibold text-sm flex items-center gap-2 mb-4">
          <Shield className="w-4 h-4 text-surface-400" /> {t('settings:serviceHealth.title')}
        </h3>
        <div className="space-y-3">
          <ServiceRow name="API Gateway" port="3000" status={apiStatus} />
          <ServiceRow name="Parsing Engine" port="8100" status={parserStatus} />
          <ServiceRow name="PostgreSQL (metadata)" port="5433" status="healthy" />
          <ServiceRow name="Redis (cache)" port="6380" status="healthy" />
        </div>
      </div>

      {/* Supported Dialects */}
      <div className="card p-5">
        <h3 className="font-semibold text-sm mb-3">{t('settings:dialects.title')}</h3>
        <div className="flex flex-wrap gap-2">
          {dialects.length > 0 ? dialects.map((d) => (
            <span key={d} className="badge-info">{d}</span>
          )) : (
            <p className="text-xs text-surface-400">{t('common:loading')}</p>
          )}
        </div>
      </div>

      {/* About */}
      <div className="card p-5">
        <h3 className="font-semibold text-sm mb-2">{t('settings:about.title')}</h3>
        <p className="text-xs text-surface-500">
          {t('settings:about.description')}
        </p>
        <div className="mt-3 flex items-center gap-4 text-xs text-surface-400">
          <span>{t('settings:about.version', { version: '0.1.0' })}</span>
          <span>Apache 2.0</span>
          <span>Clean Architecture</span>
        </div>
      </div>
    </div>
  );
}

function ServiceRow({ name, port, status }: { name: string; port: string; status: string }) {
  const { t } = useTranslation(['settings', 'common']);
  return (
    <div className="flex items-center justify-between py-2">
      <div>
        <p className="text-sm font-medium">{name}</p>
        <p className="text-xs text-surface-500">{t('settings:serviceHealth.port', { port })}</p>
      </div>
      <div className="flex items-center gap-2">
        {status === 'healthy' && <><CheckCircle className="w-4 h-4 text-emerald-500" /><span className="text-xs text-emerald-600">{t('settings:serviceHealth.healthy')}</span></>}
        {status === 'down' && <><XCircle className="w-4 h-4 text-red-500" /><span className="text-xs text-red-600">{t('settings:serviceHealth.down')}</span></>}
        {status === 'checking' && <span className="text-xs text-surface-400">{t('settings:serviceHealth.checking')}</span>}
      </div>
    </div>
  );
}
