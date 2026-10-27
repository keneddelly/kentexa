import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import AgentDashboard from './AgentDashboard';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn(), patch: jest.fn(), post: jest.fn() } }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: key => key }) }));
jest.mock('../components/BackBar', () => () => null);
jest.mock('../../onboarding/FeatureTour', () => () => null);
jest.mock('../../onboarding/TourTrigger', () => () => null);
jest.mock('../components/AgentPartnerSellersCard', () => () => null);

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{23F3}\u{231B}]/u;
const profile = { id: 7, status: 'approved', fullName: 'Juma Mussa', city: 'Dar es Salaam', district: 'Kariakoo', agentType: 'bajaji',
  maxWeightKg: 80, hasBasePoint: true, baseSetAt: '2026-10-21T08:00:00Z', baseLatitude: -6.82, baseLongitude: 39.27 };

const respond = (over = {}) => (path) => {
  const map = {
    '/agents/my-profile': profile,
    '/super-agents/my-deliveries': [],
    '/agents/my-summary': { today: { deliveries: 2, fees: 6000, codCollected: 45000 }, week: { deliveries: 9, fees: 41000 },
      totalDeliveries: 38, owedToKentexa: 900, rating: null, totalRatings: 0 },
    '/pickup-tasks/available': [], '/pickup-tasks/mine': [],
    ...over,
  };
  return path in map ? Promise.resolve({ data: map[path] }) : Promise.reject(new Error(`Unexpected request: ${path}`));
};

beforeEach(() => api.get.mockReset());

test('an office handoff shows on the Kazi tab, which opens first; the old payment model is gone', async () => {
  api.get.mockImplementation(respond({ '/super-agents/my-deliveries': [{
    trackingNumber: 'KTX-HANDOFF-7', status: 'arrived_at_hub', buyerRequestedDelivery: true, recipientName: 'Recipient', buyerPhone: '255700000001',
  }] }));
  const { container } = render(<AgentDashboard isLoggedIn onNavigate={jest.fn()} inboxUnread={0} />);
  await waitFor(() => expect(screen.getByText('KTX-HANDOFF-7')).toBeInTheDocument());
  expect(screen.getByText('Thibitisha nimepokea kutoka ofisi')).toBeInTheDocument();
  // Never the old buyer-payment, agent-orders or collections calls.
  for (const old of ['/payments/agent/dashboard', '/agent-orders/available', '/agent-orders/my-orders', '/collections/available']) {
    expect(api.get).not.toHaveBeenCalledWith(old);
  }
  expect(screen.queryByText('agent_dashboard.tab_pay')).toBeNull();
  expect(EMOJI.test(container.textContent)).toBe(false);
});

test('Mapato: real fees and pay-on-delivery cash, no invented rating, a big base card and the vehicle choice', async () => {
  api.get.mockImplementation(respond());
  render(<AgentDashboard isLoggedIn onNavigate={jest.fn()} inboxUnread={0} />);
  fireEvent.click(await screen.findByTestId('agent-tab-earnings'));
  expect(screen.getByTestId('agent-earnings')).toHaveTextContent('TZS 6,000');
  expect(screen.getByTestId('agent-earnings')).toHaveTextContent('Bado');               // no ratings yet: no 5.0
  expect(screen.getByTestId('agent-cod-cash')).toHaveTextContent('TZS 45,000');
  expect(screen.getByTestId('agent-cod-cash')).toHaveTextContent('TZS 900');
  expect(screen.getByTestId('agent-base-point')).toHaveTextContent('agent_base.card_title');
  expect(screen.getByTestId('vehicle-bajaji')).toHaveAttribute('aria-checked', 'true');
  expect(screen.getByTestId('vehicle-bicycle')).toBeInTheDocument();
});
