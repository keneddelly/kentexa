import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, renew, setSignedOutHandler } from '../api/client';
import { tokens } from '../api/tokens';
import { API_URL } from '../config';
import { registerForPush, unregisterPush } from '../push/nativePush';

/**
 * Who is signed in (#422 N0). On start: the saved access token, renewed with the saved refresh
 * credential when needed, then /auth/me. Guests can still read public content.
 */
export type User = { id: number; name?: string | null; email?: string | null; phone?: string | null; avatarUrl?: string | null; [k: string]: unknown };

type Auth = {
  ready: boolean;
  user: User | null;
  signIn: (identifier: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<Auth>({ ready: false, user: null, signIn: async () => {}, signOut: async () => {} });
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  const loadMe = useCallback(async () => {
    const me: any = await api.get('/auth/me');
    setUser((me?.user || me) as User);
  }, []);

  useEffect(() => {
    setSignedOutHandler(() => setUser(null));
    (async () => {
      try {
        const saved = await tokens.load();
        if (saved || (await renew())) {
          await loadMe();
          registerForPush();
        }
      } catch { setUser(null); } finally { setReady(true); }
    })();
  }, [loadMe]);

  const signIn = useCallback(async (identifier: string, password: string) => {
    const r: any = await api.post('/auth/login', { identifier: identifier.trim(), password, deviceId: 'kentexa-app' });
    const token = r?.accessToken || r?.access_token;
    if (!token) throw new Error('Imeshindikana kuingia.');
    await tokens.setAccess(token);
    setUser((r?.user || null) as User);
    loadMe().catch(() => {});
    registerForPush();
  }, [loadMe]);

  const signOut = useCallback(async () => {
    await unregisterPush();
    const credential = await tokens.refresh();
    try {
      if (credential) await fetch(`${API_URL}/auth/logout`, { method: 'POST', headers: { 'x-kentexa-client': 'app', 'x-kentexa-refresh': credential } });
    } catch { /* signed out on the phone anyway */ }
    await tokens.clear();
    setUser(null);
  }, []);

  const value = useMemo(() => ({ ready, user, signIn, signOut }), [ready, user, signIn, signOut]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
