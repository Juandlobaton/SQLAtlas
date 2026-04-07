import { useState, useEffect } from 'react';
import { Moon, Sun, LogOut, Search } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/shared/hooks/useTheme';
import { useAuthStore } from '@/shared/stores/auth.store';
import { CommandPalette } from '@/shared/components/CommandPalette';

const PAGE_TITLE_KEYS: Record<string, string> = {
  '/': 'dashboard',
  '/connections': 'connections',
  '/graph': 'dataLineage',
  '/explorer': 'sqlExplorer',
  '/flow': 'flowAnalysis',
  '/tables': 'tables',
  '/er-diagram': 'erDiagram',
  '/security': 'securityScanner',
  '/docs': 'documentation',
  '/settings': 'settings',
};

export function Header() {
  const { theme, toggle } = useTheme();
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const { t: tNav } = useTranslation('nav');
  const [paletteOpen, setPaletteOpen] = useState(false);

  const titleKey = PAGE_TITLE_KEYS[location.pathname];
  const pageTitle = titleKey ? tNav(titleKey) : t('appName');
  const initials = user?.email ? user.email.substring(0, 2).toUpperCase() : '??';

  // Global "/" shortcut to open command palette
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '/' && !paletteOpen && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [paletteOpen]);

  return (
    <>
      <header className="h-11 border-b border-surface-200/60 bg-surface-50/60 backdrop-blur-xl flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <h2 className="text-[13px] font-semibold text-surface-700">{pageTitle}</h2>
        </div>

        <div className="flex items-center gap-1">
          {/* Command palette hint */}
          <div
            onClick={() => setPaletteOpen(true)}
            className="hidden lg:flex items-center gap-1.5 mr-2 px-2.5 py-1 rounded-md bg-surface-100/60 border border-surface-200/50 text-surface-400 text-2xs cursor-pointer hover:bg-surface-200/60 transition-colors"
          >
            <Search className="w-3 h-3" />
            <span>{t('searchPlaceholder')}</span>
            <kbd className="text-2xs bg-surface-200/60 px-1 py-0.5 rounded font-mono">/</kbd>
          </div>

          <button onClick={toggle} title={theme === 'dark' ? t('theme.lightMode') : t('theme.darkMode')}
            className="p-1.5 rounded-md text-surface-400 hover:bg-surface-100/80 hover:text-surface-700 transition-all duration-150 cursor-pointer">
            {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          </button>

          <div className="w-px h-5 bg-surface-200/60 mx-1" />

          {user && (
            <span className="text-2xs text-surface-500 hidden sm:block mr-1">{user.email}</span>
          )}

          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white text-2xs font-bold shadow-sm">
            {initials}
          </div>

          {import.meta.env.VITE_DEMO_MODE !== 'true' && (
            <button onClick={() => { logout(); navigate('/login'); }} title={t('auth.logout')}
              className="p-1.5 rounded-md text-surface-400 hover:bg-red-500/10 hover:text-red-400 transition-all duration-150 cursor-pointer">
              <LogOut className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </header>

      <CommandPalette isOpen={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </>
  );
}
