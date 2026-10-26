import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import OrderTracking from './OrderTracking';
import api from '../../api/api';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k) => k, i18n: { language: 'sw' } }) }));
jest.mock('../../api/api', () => ({ get: jest.fn(), post: jest.fn() }));
jest.mock('../../api/tokenStore', () => ({ getAccessToken: () => 'token' }));

const ORDER = { id: 5, status: 'in_transit', paymentStatus: 'paid', totalAmount: 1000, quantity: 1,
  buyer: { id: 1, name: 'Neema' }, seller: { id: 2, name: 'BiS' }, product: { name: 'Taa' }, createdAt: '2026-10-20T10:00:00Z' };

beforeEach(() => api.get.mockImplementation((url) => Promise.resolve({ data: url.endsWith('/detail') ? ORDER : null })));

test('the seller opening an order goes back to the orders they received', async () => {
  const onNavigate = jest.fn();
  render(<OrderTracking orderId={5} isLoggedIn onNavigate={onNavigate} userRole="seller" currentUser={{ id: 2 }} />);
  fireEvent.click(await screen.findByTestId('orders-back'));
  expect(onNavigate).toHaveBeenCalledWith('SellerOrders');
});

test('the buyer goes back to the orders they bought', async () => {
  const onNavigate = jest.fn();
  render(<OrderTracking orderId={5} isLoggedIn onNavigate={onNavigate} userRole="buyer" currentUser={{ id: 1 }} />);
  fireEvent.click(await screen.findByTestId('orders-back'));
  expect(onNavigate).toHaveBeenCalledWith('MyOrders');
});
