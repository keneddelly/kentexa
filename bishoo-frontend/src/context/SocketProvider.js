import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useRoleContext } from './RoleContext';
import { getAccessToken } from '../api/tokenStore';

const SOCKET_URL = process.env.REACT_APP_API_URL || 'https://api.kentexa.com';

const SocketState = createContext({ socket: null, connected: false });

// Single shared realtime connection for the whole app, lifecycle-bound to
// contextEpoch instead of to whichever page happens to be mounted (Inbox
// previously owned its own socket, so switching role while on any other
// screen left the old context's socket connected until Inbox next mounted).
// Every context switch/login/logout bumps contextEpoch — that one signal is
// enough to always disconnect the old scoped socket and open a fresh one
// authenticated with the new ActiveRoleSession token, matching the
// disconnect-old/connect-new step of the Stage 2B context-switch contract.
export const SocketProvider = ({ children }) => {
  const { isAuthenticated, contextEpoch } = useRoleContext();
  const [state, setState] = useState({ socket: null, connected: false });
  const socketRef = useRef(null);

  useEffect(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setState({ socket: null, connected: false });

    const token = getAccessToken();
    if (!isAuthenticated || !token) return undefined;

    const next = io(SOCKET_URL, { auth: { token } });
    socketRef.current = next;
    next.on('connect', () => setState({ socket: next, connected: true }));
    next.on('disconnect', () => setState((prev) => (prev.socket === next ? { socket: next, connected: false } : prev)));
    setState({ socket: next, connected: false });

    return () => {
      next.disconnect();
      if (socketRef.current === next) socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextEpoch, isAuthenticated]);

  return <SocketState.Provider value={state}>{children}</SocketState.Provider>;
};

// Returns the live socket for the CURRENT context only (or null while
// disconnected/unauthenticated) — never the previous context's socket, so a
// component doesn't need its own contextEpoch bookkeeping to avoid
// room-joining a connection that belongs to a role the user already left.
export const useSocket = () => useContext(SocketState);
