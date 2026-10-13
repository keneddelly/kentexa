import React from 'react';
import { act, render } from '@testing-library/react';
import useIdentityRefresh, { announceIdentityChanged } from './useIdentityRefresh';
import api from '../api/api';

jest.mock('../api/api', () => ({ get: jest.fn() }));
afterEach(() => { jest.clearAllMocks(); jest.useRealTimers(); });

function Probe({ setter, enabled = true }) { useIdentityRefresh(setter, enabled); return null; }

test('re-reads the ID status right after "Tuma kitambulisho" (announce)', async () => {
  api.get.mockResolvedValue({ data: { status: 'verified', level: 4 } });
  const setter = jest.fn();
  render(<Probe setter={setter} />);
  await act(async () => { announceIdentityChanged(); });
  expect(api.get).toHaveBeenCalledWith('/identity/me');
  expect(setter).toHaveBeenCalledWith({ status: 'verified', level: 4 });
});

test('re-reads when the person comes back to the app, at most every 15 s', async () => {
  jest.useFakeTimers();
  api.get.mockResolvedValue({ data: { status: 'pending', level: 0 } });
  render(<Probe setter={jest.fn()} />);
  await act(async () => { window.dispatchEvent(new Event('focus')); });
  await act(async () => { window.dispatchEvent(new Event('focus')); });
  expect(api.get).toHaveBeenCalledTimes(1);
  jest.advanceTimersByTime(16000);
  await act(async () => { window.dispatchEvent(new Event('focus')); });
  expect(api.get).toHaveBeenCalledTimes(2);
});

test('the server saying "ID needed" (api.js event) also triggers a re-read', async () => {
  api.get.mockResolvedValue({ data: { status: 'not_submitted', level: 0 } });
  render(<Probe setter={jest.fn()} />);
  await act(async () => { window.dispatchEvent(new Event('kentexa:identity-changed')); });
  expect(api.get).toHaveBeenCalledTimes(1);
});

test('disabled (signed out): never calls the server', async () => {
  render(<Probe setter={jest.fn()} enabled={false} />);
  await act(async () => { announceIdentityChanged(); window.dispatchEvent(new Event('focus')); });
  expect(api.get).not.toHaveBeenCalled();
});
