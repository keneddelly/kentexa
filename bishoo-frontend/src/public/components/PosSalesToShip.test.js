import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import PosSalesToShip from './PosSalesToShip';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ get: jest.fn() }));

const sale = { id: 31, receiptNumber: 'RCP-31', customerName: 'Asha', customerPhone: '0712000000', total: 45000, isCod: true, balanceDue: 45000,
  createdAt: '2026-11-02T09:00:00Z', items: [{ productName: 'Taa ya sola', quantity: 1, unitPrice: 45000, productId: 4 }] };

test('POS sales waiting to be sent show in seller orders; "Tuma" opens the filled send form (owner approved 2026-11-02)', async () => {
  api.get.mockResolvedValue({ data: [sale] });
  const onNavigate = jest.fn();
  await act(async () => { render(<PosSalesToShip onNavigate={onNavigate} />); });
  expect(api.get).toHaveBeenCalledWith('/sales/to-ship');
  expect(screen.getByTestId('pos-to-ship-31')).toHaveTextContent('Asha');
  expect(screen.getByTestId('pos-to-ship-31')).toHaveTextContent('Atalipa akipokea TZS 45,000');
  fireEvent.click(screen.getByTestId('pos-ship-31'));
  expect(onNavigate).toHaveBeenCalledWith('SellerShipment', expect.objectContaining({ saleId: 31, isCod: true, name: 'Asha', phone: '0712000000',
    items: [expect.objectContaining({ name: 'Taa ya sola', qty: 1, price: 45000, productId: 4 })] }));
});

test('nothing to send: nothing shown', async () => {
  api.get.mockResolvedValue({ data: [] });
  await act(async () => { render(<PosSalesToShip onNavigate={jest.fn()} />); });
  expect(screen.queryByTestId('pos-to-ship')).toBeNull();
});
