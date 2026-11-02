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

test('POS view of Maagizo: every POS sale with how it was paid and where it went (owner 2026-11-02)', async () => {
  const { PosSalesList } = require('./PosSalesToShip');
  const rows = [
    sale,
    { id: 32, receiptNumber: 'RCP-32', customerName: null, total: 8000, isCod: false, balanceDue: 0, status: 'completed', items: [{ productName: 'Chaja', quantity: 2 }] },
    { id: 33, receiptNumber: 'RCP-33', customerName: 'Juma', total: 20000, isCod: false, balanceDue: 0, status: 'completed', shipmentTrackingNumber: 'KTX-9' },
    { id: 34, receiptNumber: 'RCP-34', customerName: 'Neema', total: 15000, isCod: false, balanceDue: 5000, status: 'completed' },
  ];
  api.get.mockImplementation(async (url) => ({ data: url === '/sales/to-ship' ? [sale] : rows }));
  const onNavigate = jest.fn();
  await act(async () => { render(<PosSalesList onNavigate={onNavigate} />); });
  expect(api.get).toHaveBeenCalledWith('/sales', { params: { limit: 50 } });
  expect(screen.getByTestId('pos-sale-31')).toHaveTextContent('Inasubiri kutumwa');
  expect(screen.getByTestId('pos-sale-32')).toHaveTextContent('Mteja wa dukani');
  expect(screen.getByTestId('pos-sale-32')).toHaveTextContent('Chaja x2');
  expect(screen.getByTestId('pos-sale-32')).toHaveTextContent('Amechukua dukani');
  expect(screen.getByTestId('pos-sale-33')).toHaveTextContent('Imetumwa · KTX-9');
  expect(screen.getByTestId('pos-sale-34')).toHaveTextContent('Deni TZS 5,000');
  expect(screen.queryByTestId('pos-sale-ship-32')).toBeNull();
  fireEvent.click(screen.getByTestId('pos-sale-ship-31'));
  expect(onNavigate).toHaveBeenCalledWith('SellerShipment', expect.objectContaining({ saleId: 31 }));
});
