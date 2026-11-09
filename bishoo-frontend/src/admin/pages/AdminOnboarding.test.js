import React from 'react';
import { render, screen } from '@testing-library/react';
import AdminOnboarding from './AdminOnboarding';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock('../components/Sidebar', () => () => null);

// Owner 2026-11-09: onboarding progress in admin.
test('each step with its count and share; where people stop; what they want to do', async () => {
  api.get.mockResolvedValue({ data: { days: 30, steps: [
    { key: 'joined', label: 'Walijiunga', count: 100, percent: 100 },
    { key: 'verified', label: 'Walithibitisha simu', count: 90, percent: 90 },
    { key: 'topics', label: 'Walichagua mada 3+', count: 60, percent: 60 },
    { key: 'community', label: 'Walijiunga na jumuiya', count: null, percent: null },
  ], goals: [{ key: 'sell', count: 12 }, { key: 'office', count: 3 }] } });
  render(<AdminOnboarding onNavigate={jest.fn()} onLogout={jest.fn()} />);
  expect(await screen.findByTestId('step-topics')).toHaveTextContent('60 · 60%');
  expect(screen.getByTestId('step-topics')).toHaveTextContent('-30 hapa');
  expect(screen.getByTestId('step-community')).toHaveTextContent('—');
  expect(screen.getByTestId('onboarding-goals')).toHaveTextContent('Kuuza bidhaa');
  expect(api.get).toHaveBeenCalledWith('/admin-intelligence/onboarding', { params: { days: 30 } });
});
