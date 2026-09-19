import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError } from '@/lib/api';

/**
 * Admin auth state (D4, 01-architecture §6):
 * - unknown → probe `/api/summary` once on mount
 * - unauthenticated → guard renders the login card (URL preserved)
 * - authenticated → children render
 */

type AuthState = 'unknown' | 'signed-in' | 'signed-out';

interface AuthApi {
  state: AuthState;
  signIn: (password: string) => Promise<{ ok: boolean; error?: string }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthApi | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>('unknown');

  useEffect(() => {
    let cancelled = false;
    api
      .get('/api/summary')
      .then(() => !cancelled && setState('signed-in'))
      .catch(() => !cancelled && setState('signed-out'));
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (password: string) => {
    try {
      await api.post('/api/login', { password });
      setState('signed-in');
      return { ok: true };
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Sign-in failed. Try again.';
      return { ok: false, error: msg };
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.post('/api/logout');
    } finally {
      setState('signed-out');
    }
  }, []);

  const value = useMemo(() => ({ state, signIn, signOut }), [state, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthApi {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
