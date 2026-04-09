import { create } from 'zustand';
import { api } from '@/shared/lib/api-client';

interface SystemStatus {
  needsSetup: boolean;
  registrationMode: 'closed' | 'invite-only' | 'open';
  multiTenant: boolean;
  microsoftSso: boolean;
}

interface AuthUser {
  sub: string;
  email: string;
  tenantId: string;
  role: string;
}

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  systemStatus: SystemStatus | null;
  login: (email: string, password: string, tenantSlug?: string) => Promise<void>;
  register: (email: string, password: string, displayName: string, tenantName: string) => Promise<void>;
  setup: (email: string, password: string, displayName: string, orgName: string) => Promise<void>;
  handleSsoCallback: (accessToken: string) => void;
  fetchSystemStatus: () => Promise<SystemStatus>;
  logout: () => Promise<void>;
  restoreSession: () => void;
}

function decodeJwt(token: string): AuthUser | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (payload.exp && payload.exp * 1000 < Date.now()) return null;
    return { sub: payload.sub, email: payload.email, tenantId: payload.tenantId, role: payload.role };
  } catch {
    return null;
  }
}

function handleAuthResponse(data: { accessToken: string }, set: any) {
  // Decode JWT from response body for UI state (cookie handles actual auth)
  const user = decodeJwt(data.accessToken);
  // Store minimal session info for UI restoration (not the token itself)
  if (user) {
    localStorage.setItem('session_user', JSON.stringify(user));
  }
  set({ user, isAuthenticated: !!user, isLoading: false, error: null });
}

const IS_DEMO = import.meta.env.VITE_DEMO_MODE === 'true';
const DEMO_USER: AuthUser = { sub: 'demo-user', email: 'demo@sqlatlas.dev', tenantId: 'demo-tenant', role: 'viewer' };

export const useAuthStore = create<AuthState>((set) => ({
  user: IS_DEMO ? DEMO_USER : null,
  isAuthenticated: IS_DEMO,
  isLoading: false,
  error: null,
  systemStatus: null,

  fetchSystemStatus: async () => {
    const res = await api.get<{ success: boolean; data: SystemStatus }>('/auth/status');
    const status = res.data;
    set({ systemStatus: status });
    return status;
  },

  login: async (email, password, tenantSlug) => {
    set({ isLoading: true, error: null });
    try {
      const body: Record<string, string> = { email, password };
      if (tenantSlug) body.tenantSlug = tenantSlug;
      const res = await api.post<{ success: boolean; data: { accessToken: string; refreshToken: string } }>(
        '/auth/login',
        body,
      );
      handleAuthResponse(res.data, set);
    } catch (err: any) {
      set({ isLoading: false, error: err.message || 'Login failed' });
      throw err;
    }
  },

  register: async (email, password, displayName, tenantName) => {
    set({ isLoading: true, error: null });
    try {
      const res = await api.post<{ success: boolean; data: { accessToken: string; refreshToken: string } }>(
        '/auth/register',
        { email, password, displayName, tenantName },
      );
      handleAuthResponse(res.data, set);
    } catch (err: any) {
      set({ isLoading: false, error: err.message || 'Registration failed' });
      throw err;
    }
  },

  setup: async (email, password, displayName, orgName) => {
    set({ isLoading: true, error: null });
    try {
      const res = await api.post<{ success: boolean; data: { accessToken: string; refreshToken: string } }>(
        '/auth/setup',
        { email, password, displayName, orgName },
      );
      handleAuthResponse(res.data, set);
    } catch (err: any) {
      set({ isLoading: false, error: err.message || 'Setup failed' });
      throw err;
    }
  },

  handleSsoCallback: (accessToken: string) => {
    const user = decodeJwt(accessToken);
    if (user) {
      localStorage.setItem('session_user', JSON.stringify(user));
    }
    set({ user, isAuthenticated: !!user, isLoading: false, error: null });
  },

  logout: async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Best-effort — cookies cleared server-side
    }
    localStorage.removeItem('session_user');
    localStorage.removeItem('sqlatlas-studio');
    set({ user: null, isAuthenticated: false });
  },

  restoreSession: () => {
    // Demo mode: auto-authenticate
    if (import.meta.env.VITE_DEMO_MODE === 'true') {
      set({ user: { sub: 'demo-user', email: 'demo@sqlatlas.dev', tenantId: 'demo-tenant', role: 'viewer' }, isAuthenticated: true });
      return;
    }
    // Restore UI state from session_user (actual auth is via HttpOnly cookie)
    const stored = localStorage.getItem('session_user');
    if (stored) {
      try {
        const user = JSON.parse(stored) as AuthUser;
        set({ user, isAuthenticated: true });
      } catch {
        localStorage.removeItem('session_user');
      }
    }
  },
}));
