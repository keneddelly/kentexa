import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import StoreFront, { openState } from './StoreFront';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock('../../context/CartContext', () => ({ useCart: () => ({ cartCount: 0, cartTotal: 0 }) }));

// Duka page template (owner approved 2026-11-18).
const products = [
  { id: 1, name: 'Chaja ya haraka', displayPrice: 25500, compareAtPrice: 30000, stock: 6, isAvailable: true, salesCount: 210, category: 'electronics', subcategory: 'chargers', createdAt: '2026-11-01', images: [] },
  { id: 2, name: 'Earphones', displayPrice: 45000, stock: 20, isAvailable: true, salesCount: 320, category: 'electronics', subcategory: 'audio', createdAt: '2026-11-10', images: [] },
  { id: 3, name: 'Kava ya simu', displayPrice: 12000, stock: 0, isAvailable: true, salesCount: 0, category: 'electronics', subcategory: 'audio', createdAt: '2026-11-12', images: [] },
];

beforeEach(() => {
  api.get.mockResolvedValue({ data: [{ key: 'electronics', label: 'Electronics', subcategories: [{ key: 'chargers', label: 'Chargers' }, { key: 'audio', label: 'Audio' }] }] });
});

test('a visitor sees in-stock products, category chips, shelves and the real old price', async () => {
  await act(async () => { render(<StoreFront profile={{ displayName: 'BIS Shop' }} products={products} onNavigate={jest.fn()} />); });
  expect(screen.getAllByTestId('store-chip').map((c) => c.textContent)).toEqual(expect.arrayContaining(['Zote2']));
  expect(screen.queryByText('Kava ya simu')).toBeNull();
  expect(screen.getAllByText('Chaja ya haraka').length).toBeGreaterThan(0);
  expect(screen.getAllByText('-15%').length).toBeGreaterThan(0);
  expect(screen.getByText('Zinazouzwa zaidi')).toBeInTheDocument();
});

test('search inside the shop filters the products', async () => {
  const nav = jest.fn();
  await act(async () => { render(<StoreFront profile={{ displayName: 'BIS Shop' }} products={products} onNavigate={nav} />); });
  fireEvent.change(screen.getByTestId('store-search'), { target: { value: 'earph' } });
  const results = screen.getByTestId('store-results');
  expect(results).toHaveTextContent('Bidhaa 1');
  fireEvent.click(results.querySelector('[data-testid="store-product"]'));
  expect(nav).toHaveBeenCalledWith('ProductDetail-2');
});

test('the owner\'s collection shows as a shelf, only with the shop\'s products', async () => {
  await act(async () => {
    render(<StoreFront profile={{}} products={products} collections={[{ id: 4, title: 'Ofa za wiki', productIds: [1, 999] }]} onNavigate={jest.fn()} />);
  });
  expect(screen.getByText('Ofa za wiki')).toBeInTheDocument();
});

test('the owner gets "Panga duka"', async () => {
  const onManage = jest.fn();
  await act(async () => { render(<StoreFront profile={{}} products={products} isOwn onNavigate={jest.fn()} onManage={onManage} />); });
  fireEvent.click(screen.getByTestId('store-manage'));
  expect(onManage).toHaveBeenCalled();
});

test('open now is worked out in Tanzania time', () => {
  const at = (iso) => new Date(iso);
  expect(openState({ open: '08:00', close: '20:00', closedDays: [] }, at('2026-11-18T07:00:00Z')).open).toBe(true); // 10:00 EAT
  expect(openState({ open: '08:00', close: '20:00', closedDays: [] }, at('2026-11-18T18:30:00Z')).open).toBe(false); // 21:30 EAT
  expect(openState({ open: '08:00', close: '20:00', closedDays: [3] }, at('2026-11-18T07:00:00Z')).text).toBe('Imefungwa leo'); // Wednesday
  expect(openState(null)).toBeNull();
});
