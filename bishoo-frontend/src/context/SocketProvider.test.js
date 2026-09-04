import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { io } from 'socket.io-client';
import { SocketProvider, useSocket } from './SocketProvider';
import { useRoleContext } from './RoleContext';
import { __resetTokenStoreForTests, setAccessToken } from '../api/tokenStore';

jest.mock('socket.io-client', () => ({ io: jest.fn() }));
jest.mock('./RoleContext', () => ({ useRoleContext: jest.fn() }));

const fakeSocket = () => ({ on: jest.fn(), off: jest.fn(), emit: jest.fn(), disconnect: jest.fn() });

// Reads whatever the current shared socket/connected state is on every
// render — a plain consumer standing in for any real component (Inbox,
// a future badge, etc.) that would call useSocket() itself.
let lastSocketSeen;
const Probe = () => {
  lastSocketSeen = useSocket();
  return null;
};

beforeEach(() => {
  __resetTokenStoreForTests();
  jest.clearAllMocks();
  io.mockImplementation(() => fakeSocket());
});

test('connects once authenticated, and reconnects with a fresh token on every contextEpoch change', async () => {
  setAccessToken('transport-token');
  useRoleContext.mockReturnValue({ isAuthenticated: true, contextEpoch: 1 });
  const view = render(<SocketProvider><Probe /></SocketProvider>);
  await waitFor(() => expect(io).toHaveBeenCalledTimes(1));
  expect(io.mock.calls[0][1].auth.token).toBe('transport-token');
  const oldSocket = io.mock.results[0].value;

  // Role switch: new token, bumped contextEpoch — this is the exact signal
  // a real switchRole()/logout()/login() produces in RoleContext.js.
  setAccessToken('seller-token');
  useRoleContext.mockReturnValue({ isAuthenticated: true, contextEpoch: 2 });
  view.rerender(<SocketProvider><Probe /></SocketProvider>);

  await waitFor(() => expect(io).toHaveBeenCalledTimes(2));
  expect(oldSocket.disconnect).toHaveBeenCalledTimes(1);
  expect(io.mock.calls[1][1].auth.token).toBe('seller-token');
});

test('disconnects and exposes no socket once logged out', async () => {
  setAccessToken('a-token');
  useRoleContext.mockReturnValue({ isAuthenticated: true, contextEpoch: 1 });
  const view = render(<SocketProvider><Probe /></SocketProvider>);
  await waitFor(() => expect(io).toHaveBeenCalledTimes(1));
  const activeSocket = io.mock.results[0].value;

  useRoleContext.mockReturnValue({ isAuthenticated: false, contextEpoch: 2 });
  view.rerender(<SocketProvider><Probe /></SocketProvider>);

  await waitFor(() => expect(activeSocket.disconnect).toHaveBeenCalledTimes(1));
  expect(lastSocketSeen).toEqual({ socket: null, connected: false });
  expect(io).toHaveBeenCalledTimes(1); // no reconnect attempt while logged out
});
