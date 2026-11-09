import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import api from '../../api/api';
import MyResales from './MyResales';

jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), delete: jest.fn() } }));

const row = (over) => ({ orderId: 50, product: 'Simu', quantity: 1, sellingPrice: 55000, profit: 13000, paidRef: null, ...over });
beforeEach(() => {
  api.get.mockImplementation(async (url) => {
    if (url === '/resale/profits') return { data: { totals: { coming: 0, owed: 0, paid: 13000, received: 0 }, items: [row({ state: 'paid', paidRef: 'QK71X2', supplierName: 'BIS' })] } };
    if (url === '/resale/supplier-orders') return { data: { totals: {}, items: [row({ state: 'late', resellerName: 'Neema', resellerPhone: '+255700000001' })] } };
    return { data: [] };
  });
  api.post.mockResolvedValue({ data: {} });
});

test('the reseller confirms a profit the shop says it paid', async () => {
  await act(async () => { render(<MyResales onNavigate={jest.fn()} startTab="profits" />); });
  expect(screen.getByTestId('state-paid')).toBeInTheDocument();
  expect(screen.getByText('Muamala: QK71X2')).toBeInTheDocument();
  await act(async () => { fireEvent.click(screen.getByTestId('confirm-50')); });
  expect(api.post).toHaveBeenCalledWith('/resale/orders/50/confirm');
});

test('the shop pays a late profit with its M-Pesa reference', async () => {
  await act(async () => { render(<MyResales onNavigate={jest.fn()} startTab="supplier" />); });
  expect(screen.getByTestId('state-late')).toHaveTextContent('Imechelewa');
  expect(screen.getByText(/Neema · \+255700000001/)).toBeInTheDocument();
  fireEvent.change(screen.getByTestId('ref-50'), { target: { value: 'QK71X2' } });
  await act(async () => { fireEvent.click(screen.getByTestId('paid-50')); });
  expect(api.post).toHaveBeenCalledWith('/resale/orders/50/paid', { ref: 'QK71X2' });
  expect(screen.getByRole('status')).toHaveTextContent('Muuzaji ataambiwa');
});

test('joining is one tap after accepting the rules; then the catalogue opens', async () => {
  api.get.mockImplementation(async (url) => {
    if (url === '/resale/membership') return { data: { member: false } };
    if (url === '/resale/products') return { data: { items: [], categories: [], hasMore: false } };
    return { data: [] };
  });
  api.post.mockResolvedValue({ data: { member: true } });
  await act(async () => { render(<MyResales onNavigate={jest.fn()} startTab="open" />); });
  expect(screen.getByTestId('resale-join-btn')).toBeDisabled();
  fireEvent.click(screen.getByTestId('resale-rules'));
  await act(async () => { fireEvent.click(screen.getByTestId('resale-join-btn')); });
  expect(api.post).toHaveBeenCalledWith('/resale/join', { acceptRules: true });
  expect(screen.getByTestId('resale-open-products')).toBeInTheDocument();
});
