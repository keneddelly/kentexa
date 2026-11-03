import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import PosToday from './PosToday';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));

const day = (shift) => ({ data: {
  ready: true, receipts: 64, total: 486500, profit: 71200, byMethod: { cash: 210000, mpesa: 240500, deni: 36000 },
  top: [{ name: 'Sukari 1kg', qty: 38 }], expenses: [{ id: 1, reason: 'Usafiri wa mzigo', amount: 10000 }], expensesTotal: 10000, shift,
} });

test('Leo: the day from the server; no shift yet: open it with the starting cash (owner approved 2026-11-03)', async () => {
  api.get.mockResolvedValue(day(null));
  api.post.mockResolvedValue({ data: {} });
  await act(async () => { render(<PosToday onClose={jest.fn()} />); });
  expect(screen.getByTestId('pos-today-total')).toHaveTextContent('TZS 486,500');
  expect(screen.getByText('Faida ya bidhaa: TZS 71,200')).toBeInTheDocument();
  expect(screen.getByText('Usafiri wa mzigo')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Pesa ya kuanzia'), { target: { value: '50,000' } });
  await act(async () => { fireEvent.click(screen.getByTestId('pos-open-shift')); });
  expect(api.post).toHaveBeenCalledWith('/sales/pos/shifts/open', { openingFloat: 50000 });
});

test('Funga zamu: the drawer, the counted cash and the difference', async () => {
  api.get.mockResolvedValue(day({ id: 3, openingFloat: 50000, cashSales: 210000, cashDebtPayments: 8000, cashExpenses: 15000, expected: 253000 }));
  api.post.mockResolvedValue({ data: { expected: 253000, counted: 252000, difference: -1000 } });
  await act(async () => { render(<PosToday onClose={jest.fn()} />); });
  expect(screen.getByText('TZS 253,000')).toBeInTheDocument();
  fireEvent.change(screen.getByTestId('pos-counted'), { target: { value: '252000' } });
  expect(screen.getByTestId('pos-diff')).toHaveTextContent('Pungufu TZS 1,000');
  await act(async () => { fireEvent.click(screen.getByTestId('pos-close-shift')); });
  expect(api.post).toHaveBeenCalledWith('/sales/pos/shifts/close', { countedCash: 252000, note: undefined });
  expect(screen.getByTestId('pos-shift-closed')).toHaveTextContent('Pungufu TZS 1,000');
});
