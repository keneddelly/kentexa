import { renderHook, act } from '@testing-library/react';
import useAgentPresence, { hasActiveAgentRole } from './useAgentPresence';
import api from '../api/api';

jest.mock('../api/api', () => ({ post: jest.fn(() => Promise.resolve({ data: { online: true } })) }));
beforeEach(() => { jest.useFakeTimers(); api.post.mockReset(); api.post.mockImplementation(() => Promise.resolve({ data: { online: true } })); });
afterEach(() => jest.useRealTimers());

const agent = [{ roleType: 'buyer', status: 'active' }, { roleType: 'agent', status: 'active' }];

test('only an account with an active agent role says "I\'m here"', () => {
  expect(hasActiveAgentRole(agent)).toBe(true);
  expect(hasActiveAgentRole([{ roleType: 'agent', status: 'pending' }])).toBe(false);
  expect(hasActiveAgentRole(null)).toBe(false);
  renderHook(() => useAgentPresence(true, [{ roleType: 'buyer', status: 'active' }]));
  renderHook(() => useAgentPresence(false, agent));
  expect(api.post).not.toHaveBeenCalled();
});

test('an agent with the app open: once at start, then every 5 minutes; stops when closed', () => {
  const { unmount } = renderHook(() => useAgentPresence(true, agent));
  expect(api.post).toHaveBeenCalledTimes(1);
  expect(api.post).toHaveBeenCalledWith('/agents/seen');
  act(() => { jest.advanceTimersByTime(5 * 60 * 1000); });
  expect(api.post).toHaveBeenCalledTimes(2);
  unmount();
  act(() => { jest.advanceTimersByTime(10 * 60 * 1000); });
  expect(api.post).toHaveBeenCalledTimes(2);
});
