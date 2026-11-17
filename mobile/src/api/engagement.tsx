import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './client';
import { useAuth } from '../auth/AuthContext';

/**
 * Likes and saves (#422 N1): which posts this person has hearted and saved, loaded once after
 * sign-in, changed at once on tap and put back if the server says no. Same endpoints as the web.
 */
type Kind = 'like' | 'save';
type Engage = {
  liked: (id: number) => boolean;
  saved: (id: number) => boolean;
  toggle: (id: number, kind: Kind) => Promise<boolean | null>;
};

const Ctx = createContext<Engage>({ liked: () => false, saved: () => false, toggle: async () => null });
export const useEngagement = () => useContext(Ctx);

const ids = (r: any) => new Set<number>((Array.isArray(r) ? r : []).map(Number).filter((n) => Number.isInteger(n)));

export function EngagementProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [likes, setLikes] = useState<Set<number>>(new Set());
  const [saves, setSaves] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!user) { setLikes(new Set()); setSaves(new Set()); return; }
    api.get('/feed/liked/ids').then((r) => setLikes(ids(r))).catch(() => {});
    api.get('/feed/saved/ids').then((r) => setSaves(ids(r))).catch(() => {});
  }, [user]);

  const toggle = useCallback(async (id: number, kind: Kind) => {
    const set = kind === 'like' ? setLikes : setSaves;
    const flip = (on: boolean) => set((prev) => { const n = new Set(prev); if (on) n.add(id); else n.delete(id); return n; });
    const was = (kind === 'like' ? likes : saves).has(id);
    flip(!was);
    try {
      const r: any = await api.post(`/feed/${id}/engage`, { type: kind });
      const now = Boolean(r?.toggled);
      flip(now);
      return now;
    } catch {
      flip(was);
      return null;
    }
  }, [likes, saves]);

  const value = useMemo(() => ({ liked: (id: number) => likes.has(id), saved: (id: number) => saves.has(id), toggle }), [likes, saves, toggle]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
