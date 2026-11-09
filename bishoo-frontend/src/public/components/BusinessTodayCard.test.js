import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import BusinessTodayCard from './BusinessTodayCard';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: { language: 'sw' } }) }));

// Owner 2026-11-09 audit: the AI business insight moves to Business Home, with today's real counts.
test('today counts, then the AI insight', async () => {
  api.get.mockResolvedValue({ data: { commerce: { ordersToday: 3, paymentsCompletedToday: 2, pendingInvoicesCount: 1 }, customerActivity: { profileVisitsToday: 40, newFollowersToday: 5, productViewsToday: 90 } } });
  api.post.mockResolvedValue({ data: { insight: 'Watu 40 walitembelea leo.', recommendation: 'Jibu ujumbe 2 unaosubiri.' } });
  render(<BusinessTodayCard businessId={9} onNavigate={jest.fn()} />);
  expect(await screen.findByTestId('business-today-card')).toHaveTextContent('Oda leo');
  await waitFor(() => expect(screen.getByTestId('business-insight')).toHaveTextContent('Jibu ujumbe 2 unaosubiri.'));
  expect(api.post).toHaveBeenCalledWith('/business/9/today/insight', expect.objectContaining({ language: 'sw' }));
});

test('no counts: no card; AI down: counts only', async () => {
  api.get.mockResolvedValue({ data: { commerce: {}, customerActivity: {} } });
  api.post.mockRejectedValue(new Error('down'));
  render(<BusinessTodayCard businessId={9} onNavigate={jest.fn()} />);
  await screen.findByTestId('business-today-card');
  await waitFor(() => expect(screen.queryByTestId('business-insight')).toBeNull());
});
