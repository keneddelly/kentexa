import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import PosDebts, { reminderText, waPhone } from './PosDebts';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));

test('the reminder is polite: shop name and amount only; WhatsApp number', () => {
  expect(reminderText('BIS', 'Neema Juma', 12000)).toBe('Habari Neema, BIS linakukumbusha deni la TZS 12,000. Asante kwa kununua kwetu.');
  expect(waPhone('0712 345 678')).toBe('255712345678');
});

test('Madeni: customers who owe, Pokea malipo, reminder by the shop\'s own WhatsApp (owner approved 2026-11-03)', async () => {
  api.get.mockResolvedValue({ data: { ready: true, customerTotal: 12000, supplierTotal: 0, suppliers: [], customers: [
    { key: 'p:712345678', name: 'Neema Juma', phone: '0712345678', owed: 12000, since: '2026-10-12', sales: [{ id: 3, receiptNumber: 'R-0388', at: '2026-10-12', balanceDue: 8000 }, { id: 4, receiptNumber: 'R-0401', at: '2026-10-20', balanceDue: 4000 }] },
  ] } });
  api.post.mockResolvedValue({ data: { paid: 4000, left: 8000 } });
  await act(async () => { render(<PosDebts shopName="BIS" onClose={jest.fn()} />); });
  fireEvent.click(screen.getByText('Neema Juma'));
  expect(screen.getByText('Mkumbushe (WhatsApp)').closest('a').getAttribute('href')).toContain('https://wa.me/255712345678?text=');
  fireEvent.change(screen.getByLabelText('Kiasi kilicholipwa'), { target: { value: '4000' } });
  await act(async () => { fireEvent.click(screen.getByTestId('debt-pay-customer')); });
  expect(api.post).toHaveBeenCalledWith('/sales/pos/debts/customer', { customerKey: 'p:712345678', amount: 4000, method: 'cash' });
  expect(screen.getByRole('status')).toHaveTextContent('Limebaki TZS 8,000');
});
