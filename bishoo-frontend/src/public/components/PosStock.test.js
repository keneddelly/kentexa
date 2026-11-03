import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import PosStock, { findProducts } from './PosStock';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
const products = [{ id: 1, name: 'Mafuta ya kupikia 1L', stock: 4, barcode: '6201', costPrice: 4500 }, { id: 2, name: 'Sabuni ya kufulia', stock: 10 }];

test('search by name or barcode', () => {
  expect(findProducts(products, '6201').map((p) => p.id)).toEqual([1]);
  expect(findProducts(products, 'sabuni').map((p) => p.id)).toEqual([2]);
  expect(findProducts(products, '')).toEqual([]);
});

test('Pokea mzigo: items with cost, supplier unpaid, stock goes up (owner approved 2026-11-03)', async () => {
  api.get.mockResolvedValue({ data: { ready: true, low: [], suppliers: [] } });
  api.post.mockResolvedValue({ data: { id: 1 } });
  const changed = jest.fn();
  await act(async () => { render(<PosStock products={products} onClose={jest.fn()} onStockChanged={changed} />); });
  fireEvent.change(screen.getByLabelText('Msambazaji'), { target: { value: 'Bakhresa' } });
  fireEvent.change(screen.getByTestId('stock-search'), { target: { value: '6201' } });
  fireEvent.keyDown(screen.getByTestId('stock-search'), { key: 'Enter' });
  fireEvent.change(screen.getByLabelText('Idadi ya Mafuta ya kupikia 1L'), { target: { value: '12' } });
  expect(screen.getByTestId('stock-total')).toHaveTextContent('TZS 54,000');
  fireEvent.click(screen.getByLabelText(/Bado sijamlipa msambazaji/));
  await act(async () => { fireEvent.click(screen.getByTestId('stock-receive')); });
  expect(api.post).toHaveBeenCalledWith('/sales/pos/stock/receive', { supplierName: 'Bakhresa', supplierPhone: undefined, items: [{ productId: 1, qty: 12, unitCost: 4500 }], unpaid: true });
  expect(changed).toHaveBeenCalledWith([{ productId: 1, delta: 12 }]);
});
