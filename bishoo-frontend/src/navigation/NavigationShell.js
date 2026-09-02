import { useCallback, useEffect, useRef } from 'react';
import { evaluateDestination, historyEntryFor, isHistoryEntryValid } from './navigationPolicy';
import { homeForRole } from './navigationRegistry';

export const resolveNavigationRequest = (page, context) => evaluateDestination({
  page,
  isAuthenticated: context.isAuthenticated,
  roleType: context.roleType,
  capabilities: context.capabilities,
});

export const popValidHistoryEntry = (history, context) => {
  const remaining = [...history];
  while (remaining.length) {
    const entry = remaining.pop();
    const decision = resolveNavigationRequest(entry.page, context);
    if (isHistoryEntryValid(entry, context) && decision.allowed) return { entry, remaining };
  }
  return { entry: null, remaining: [] };
};

export const resolveBrowserEntry = (requestedPage, browserState, context) => {
  const decision = resolveNavigationRequest(requestedPage, context);
  const entry = browserState && historyEntryFor({
    page: requestedPage,
    contextEpoch: browserState.contextEpoch,
    accountRoleId: browserState.accountRoleId,
  });
  const stateValid = !entry || isHistoryEntryValid(entry, context);
  return decision.allowed && stateValid
    ? decision
    : { ...decision, allowed: false, reason: decision.allowed ? 'STALE_HISTORY' : decision.reason, page: homeForRole(context.roleType) };
};

const useNavigationShell = ({
  page, setPage, navParams, setNavParams, navHistory, setNavHistory,
  isAuthenticated, activeContext, capabilities, contextEpoch, syncUrl, onUnavailable,
}) => {
  const pageRef = useRef(page);
  useEffect(() => { pageRef.current = page; }, [page]);

  const context = {
    isAuthenticated,
    roleType: activeContext?.roleType || null,
    accountRoleId: activeContext?.accountRoleId ?? null,
    capabilities: capabilities || [],
    contextEpoch,
  };
  const contextRef = useRef(context);
  contextRef.current = context;

  const commit = useCallback((destination, params, browserMode = 'push') => {
    const current = contextRef.current;
    setNavParams(params || null);
    setPage(destination);
    pageRef.current = destination;
    syncUrl(destination, params, {
      page: destination,
      contextEpoch: current.contextEpoch,
      accountRoleId: current.accountRoleId,
    }, browserMode);
    window.scrollTo(0, 0);
  }, [setNavParams, setPage, syncUrl]);

  const replace = useCallback((requestedPage, params = null, browserMode = 'replace') => {
    const decision = resolveNavigationRequest(requestedPage, contextRef.current);
    if (!decision.allowed) onUnavailable?.(decision);
    commit(decision.page, decision.allowed ? params : null, browserMode);
    return decision;
  }, [commit, onUnavailable]);

  const back = useCallback(() => {
    setNavHistory((history) => {
      const { entry, remaining } = popValidHistoryEntry(history, contextRef.current);
      commit(entry?.page || homeForRole(contextRef.current.roleType), null);
      return remaining;
    });
  }, [commit, setNavHistory]);

  const navigate = useCallback((requestedPage, params = null) => {
    if (requestedPage === 'back') { back(); return; }
    const decision = resolveNavigationRequest(requestedPage, contextRef.current);
    if (!decision.allowed) {
      onUnavailable?.(decision);
      setNavHistory([]);
      commit(decision.page, null, 'replace');
      return decision;
    }
    if (pageRef.current !== requestedPage && requestedPage !== 'PublicLogin') {
      const entry = historyEntryFor({
        page: pageRef.current,
        contextEpoch: contextRef.current.contextEpoch,
        accountRoleId: contextRef.current.accountRoleId,
      });
      if (entry) setNavHistory((history) => [...history, entry].slice(-10));
    }
    commit(requestedPage, params);
    return decision;
  }, [back, commit, onUnavailable, setNavHistory]);

  const resetForContext = useCallback(() => {
    setNavHistory([]);
    commit(homeForRole(contextRef.current.roleType), null, 'replace');
  }, [commit, setNavHistory]);

  const handleBrowserDestination = useCallback((requestedPage, params, browserState) => {
    const decision = resolveBrowserEntry(requestedPage, browserState, contextRef.current);
    if (!decision.allowed) {
      onUnavailable?.(decision);
      setNavHistory([]);
      commit(homeForRole(contextRef.current.roleType), null, 'replace');
      return false;
    }
    setNavParams(params || null);
    setPage(requestedPage);
    pageRef.current = requestedPage;
    return true;
  }, [commit, onUnavailable, setNavHistory, setNavParams, setPage]);

  return { page, navParams, navHistory, navigate, back, replace, resetForContext, handleBrowserDestination };
};

export default useNavigationShell;
