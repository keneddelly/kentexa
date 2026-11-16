import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import SpikeModeCard from './SpikeModeCard';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));

test('issue #368: the admin sees the live numbers and can switch spike mode on', async () => {
  api.get.mockImplementation((url) => Promise.resolve({ data: url === '/traffic/spike-mode'
    ? { on: false, source: 'env', at: null }
    : { requests: { perMinute: [{ minute: '06:00', count: 42 }], latencyMs: { p95: 180 }, status: { server5xx: 0, tooMany429: 2 } },
        database: { pool: { total: 6, idle: 2, waiting: 0, max: 10 } } } }));
  api.post.mockResolvedValue({ data: { on: true, source: 'admin', at: 'x' } });
  await act(async () => { render(<SpikeModeCard />); });
  const card = screen.getByTestId('spike-mode-card');
  expect(card).toHaveTextContent('Maombi dakika hii: 42');
  expect(card).toHaveTextContent('4/10 zinatumika, 0 zinasubiri');
  await act(async () => { fireEvent.click(screen.getByTestId('spike-mode-toggle')); });
  expect(api.post).toHaveBeenCalledWith('/traffic/spike-mode', { on: true });
  expect(card).toHaveTextContent('IMEWASHWA');
});
