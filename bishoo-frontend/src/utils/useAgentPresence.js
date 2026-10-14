import { useEffect } from 'react';
import api from '../api/api';

// D1 (owner 2026-10-14): an agent's "online" ends by itself after a period
// with no activity. While ANY KenteXa screen is open on an agent's phone, this
// tells the server "I'm here" every few minutes (and when the app comes back
// to the front). Only for accounts with an active agent role; for an agent who
// is offline the server changes nothing.
export const AGENT_PRESENCE_INTERVAL_MS = 5 * 60 * 1000;

export const hasActiveAgentRole = (availableRoles) =>
  Array.isArray(availableRoles) && availableRoles.some((r) => r?.roleType === 'agent' && r?.status === 'active');

export default function useAgentPresence(isLoggedIn, availableRoles, intervalMs = AGENT_PRESENCE_INTERVAL_MS) {
  const isAgent = !!isLoggedIn && hasActiveAgentRole(availableRoles);
  useEffect(() => {
    if (!isAgent) return undefined;
    const visible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden';
    const ping = () => { if (visible()) api.post('/agents/seen').catch(() => {}); };
    ping();
    const timer = setInterval(ping, intervalMs);
    const onVisibility = () => { if (visible()) ping(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisibility); };
  }, [isAgent, intervalMs]);
}
