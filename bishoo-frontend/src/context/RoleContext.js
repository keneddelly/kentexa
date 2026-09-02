import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import api, { cancelContextRequests, configureAuthLifecycle } from '../api/api';
import { clearAccessToken, getAccessToken, setAccessToken } from '../api/tokenStore';
import { adaptAvailableRoles, landingPageForContext, presentationForRole } from './rolePresentation';

const RoleContextState = createContext(null);

const validContext = (context) => context
  && Number.isFinite(Number(context.userId))
  && Number.isFinite(Number(context.accountRoleId))
  && typeof context.roleType === 'string'
  && Number.isFinite(Number(context.contextVersion));

const validAuthResponse = (data) => {
  const token = data?.accessToken || data?.access_token;
  if (!token || !validContext(data?.activeContext) || !Array.isArray(data?.availableRoles)) {
    throw new Error('INVALID_AUTH_CONTEXT_RESPONSE');
  }
  return token;
};

export const RoleContextProvider = ({ children }) => {
  const [status, setStatus] = useState(() => getAccessToken() ? 'restoring' : 'unauthenticated');
  const [user, setUser] = useState(null);
  const [activeContext, setActiveContext] = useState(null);
  const [availableRoles, setAvailableRoles] = useState([]);
  const [presentationProfiles, setPresentationProfiles] = useState([]);
  const [contextEpoch, setContextEpoch] = useState(0);
  const [switching, setSwitching] = useState(false);
  const epochRef = useRef(0);
  const switchLock = useRef(false);

  const clearLocalAuthority = useCallback((reason = 'logout') => {
    cancelContextRequests();
    clearAccessToken();
    epochRef.current += 1;
    setContextEpoch(epochRef.current);
    setUser(null);
    setActiveContext(null);
    setAvailableRoles([]);
    setPresentationProfiles([]);
    setStatus('unauthenticated');
    setSwitching(false);
    switchLock.current = false;
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('kentexa-context-cleared', { detail: { reason } }));
    }
  }, []);

  useEffect(() => {
    // Retire the old cosmetic authority. It is deliberately not migrated.
    localStorage.removeItem('kentexa_active_profile_id');
    configureAuthLifecycle({
      getContextEpoch: () => epochRef.current,
      onCurrentContextRevoked: () => clearLocalAuthority('ROLE_CONTEXT_REVOKED'),
    });
  }, [clearLocalAuthority]);

  const loadPresentationProfiles = useCallback(async () => {
    try {
      const response = await api.get('/profiles/mine');
      const profiles = Array.isArray(response.data) ? response.data : [];
      setPresentationProfiles(profiles);
      return profiles;
    } catch (error) {
      if (error?.code === 'STALE_CONTEXT_RESPONSE') throw error;
      setPresentationProfiles([]);
      return [];
    }
  }, []);

  const acceptAuthResponse = useCallback(async (data) => {
    const token = validAuthResponse(data);
    cancelContextRequests();
    setAccessToken(token);
    epochRef.current += 1;
    setContextEpoch(epochRef.current);
    setUser(data.user || null);
    setActiveContext(data.activeContext);
    setAvailableRoles(data.availableRoles);
    setStatus('authenticated');
    const profiles = await loadPresentationProfiles().catch(() => []);
    return { context: data.activeContext, profiles };
  }, [loadPresentationProfiles]);

  const refreshContext = useCallback(async () => {
    if (!getAccessToken()) {
      clearLocalAuthority('missing_token');
      return null;
    }
    const me = await api.get('/auth/me');
    if (!validContext(me.data?.activeContext)) throw new Error('INVALID_ME_CONTEXT_RESPONSE');
    const roles = await api.get('/auth/roles');
    if (!Array.isArray(roles.data?.availableRoles)) throw new Error('INVALID_ROLES_RESPONSE');
    setUser(me.data.user || null);
    setActiveContext(me.data.activeContext);
    setAvailableRoles(roles.data.availableRoles);
    setStatus('authenticated');
    await loadPresentationProfiles();
    return me.data.activeContext;
  }, [clearLocalAuthority, loadPresentationProfiles]);

  useEffect(() => {
    if (!getAccessToken()) return;
    refreshContext().catch((error) => {
      if (error?.code !== 'STALE_CONTEXT_RESPONSE') clearLocalAuthority('restore_failed');
    });
  }, [clearLocalAuthority, refreshContext]);

  const switchRole = useCallback(async (accountRoleId) => {
    if (switchLock.current) throw new Error('ROLE_SWITCH_IN_PROGRESS');
    const target = availableRoles.find((role) => Number(role.accountRoleId) === Number(accountRoleId));
    if (!target || target.status !== 'active' || target.switchable !== true) {
      throw new Error('ROLE_NOT_SWITCHABLE');
    }
    switchLock.current = true;
    setSwitching(true);
    try {
      const response = await api.post('/auth/switch-role', { accountRoleId: Number(accountRoleId) });
      const token = validAuthResponse(response.data);
      if (Number(response.data.activeContext.accountRoleId) !== Number(accountRoleId)) {
        throw new Error('SWITCH_CONTEXT_MISMATCH');
      }

      cancelContextRequests();
      setAccessToken(token);
      epochRef.current += 1;
      const nextEpoch = epochRef.current;
      setContextEpoch(nextEpoch);
      setActiveContext(response.data.activeContext);
      setAvailableRoles(response.data.availableRoles);
      if (response.data.user) setUser(response.data.user);
      setStatus('authenticated');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('kentexa-context-changed', {
          detail: {
            contextEpoch: nextEpoch,
            activeContext: response.data.activeContext,
            landingPage: landingPageForContext(response.data.activeContext),
          },
        }));
      }
      return response.data.activeContext;
    } finally {
      switchLock.current = false;
      setSwitching(false);
    }
  }, [availableRoles]);

  const logout = useCallback(async () => {
    try { await api.post('/auth/logout'); } catch { /* local logout must still complete */ }
    clearLocalAuthority('logout');
  }, [clearLocalAuthority]);

  const activeProfile = useMemo(() => presentationForRole(
    activeContext ? { ...activeContext, switchable: true, status: 'active' } : null,
    presentationProfiles,
    user,
  ), [activeContext, presentationProfiles, user]);
  const roleOptions = useMemo(
    () => adaptAvailableRoles(availableRoles, presentationProfiles, user),
    [availableRoles, presentationProfiles, user],
  );

  const value = useMemo(() => ({
    status,
    isAuthenticated: status === 'authenticated',
    user,
    activeContext,
    availableRoles,
    capabilities: activeContext?.capabilities || [],
    activeRoleType: activeContext?.roleType || null,
    activeProfile,
    roleOptions,
    contextEpoch,
    switching,
    acceptAuthResponse,
    switchRole,
    refreshContext,
    logout,
    clearLocalAuthority,
  }), [status, user, activeContext, availableRoles, activeProfile, roleOptions,
    contextEpoch, switching, acceptAuthResponse, switchRole, refreshContext, logout, clearLocalAuthority]);

  return <RoleContextState.Provider value={value}>{children}</RoleContextState.Provider>;
};

export const useRoleContext = () => {
  const context = useContext(RoleContextState);
  if (!context) throw new Error('useRoleContext must be used inside RoleContextProvider');
  return context;
};

export { validAuthResponse };
