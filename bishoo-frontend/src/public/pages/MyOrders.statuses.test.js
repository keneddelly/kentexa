import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import MyOrders from './MyOrders';
import api from '../../api/api';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k) => k, i18n: { language: 'sw' } }) }));
jest.mock('../../api/api', () => ({ get: jest.fn(), post: jest.fn(), patch: jest.fn() }));

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{23F3}\u{231B}]/u;
const ORDERS = [
  { id: 1, status: 'pending_payment', paymentStatus: 'pending', totalAmount: 10000, quantity: 1, product: { name: 'Taa' }, createdAt: '2026-10-20T10:00:00Z' },
  { id: 2, status: 'in_transit', paymentStatus: 'paid', totalAmount: 20000, quantity: 1, product: { name: 'Simu' }, trackingNumber: 'KTX-2', createdAt: '2026-10-20T10:00:00Z' },
  { id: 3, status: 'completed', paymentStatus: 'released', totalAmount: 30000, quantity: 1, product: { name: 'Kiatu' }, createdAt: '2026-10-20T10:00:00Z' },
];

beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockImplementation((url) => Promise.resolve({ data: url === '/orders/my-orders' ? ORDERS : [] }));
});

test('tabs and labels use the real order statuses; an unpaid order can be cancelled; no emoji', async () => {
  const { container } = render(<MyOrders isLoggedIn onNavigate={jest.fn()} />);
  expect(await screen.findByTestId('cancel-1')).toBeInTheDocument();      // was never shown before
  expect(screen.queryByTestId('cancel-2')).toBeNull();
  const labels = screen.getAllByTestId('buyer-status').map((n) => n.textContent);
  expect(labels).toEqual(['Inasubiri malipo', 'Iko njiani', 'Imekamilika']);
  fireEvent.click(screen.getByTestId('buyer-tab-coming'));
  expect(screen.getAllByTestId('buyer-status').map((n) => n.textContent)).toEqual(['Iko njiani']);
  fireEvent.click(screen.getByTestId('buyer-tab-pay'));
  expect(within(container).getAllByTestId('buyer-status')).toHaveLength(1);
  expect(EMOJI.test(container.textContent)).toBe(false);
});

test('paying online never calls the test-only confirm endpoint', async () => {
  const fs = require('fs');
  const src = fs.readFileSync(require.resolve('./MyOrders.js'), 'utf8');
  expect(src).not.toMatch(/mock-confirm/);
});
