import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import AgentDashboard from './AgentDashboard';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: key => key }) }));
jest.mock('../components/BackBar', () => () => null);
jest.mock('../../onboarding/FeatureTour', () => () => null);
jest.mock('../../onboarding/TourTrigger', () => () => null);

test('shows an assigned hub handoff without profile city even if direct orders fail', async () => {
  api.get.mockImplementation(path => {
    if (path === '/agents/my-profile') return Promise.resolve({ data: {
      id: 7, status: 'approved', fullName: 'Test Agent', city: null, district: null, region: null,
    } });
    if (path === '/agent-orders/available') return Promise.reject(new Error('direct order service unavailable'));
    if (path === '/super-agents/my-deliveries') return Promise.resolve({ data: [{
      trackingNumber: 'KTX-HANDOFF-7', status: 'arrived_at_hub', buyerRequestedDelivery: true,
      recipientName: 'Recipient', buyerPhone: '255700000001',
    }] });
    if (path === '/agent-orders/my-orders' || path === '/collections/available' ||
        path === '/collections/my-collections') return Promise.resolve({ data: [] });
    if (path === '/agent-orders/stats' || path === '/payments/agent/dashboard') {
      return Promise.resolve({ data: {} });
    }
    return Promise.reject(new Error(`Unexpected request: ${path}`));
  });

  render(<AgentDashboard isLoggedIn onNavigate={jest.fn()} inboxUnread={0} />);

  fireEvent.click(await screen.findByText('agent_dashboard.tab_work_count'));
  await waitFor(() => expect(screen.getByText('KTX-HANDOFF-7')).toBeInTheDocument());
  expect(api.get).toHaveBeenCalledWith('/super-agents/my-deliveries');
  expect(screen.getByText('Thibitisha nimepokea kutoka hub')).toBeInTheDocument();
});
