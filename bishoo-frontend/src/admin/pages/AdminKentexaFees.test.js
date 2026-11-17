import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import AdminKentexaFees from './AdminKentexaFees';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
jest.mock('../components/Sidebar', () => () => null);

const accounts = {
  ready: true, invoicesOn: true,
  totals: { accounts: 5, owing: 2, late: 1, owed: 27000, paid: 40000, waiting: 0 },
  rows: [{ accountType: 'office', accountId: 12, who: 'Samatta Ofisi', phone: '0712000000', jobs: 42, free: 20, monthJobs: 8,
    fees: 24500, paid: 2000, owed: 22500, late: true, waiting: 0, invoices: 1, lastJobAt: '2026-11-15T10:00:00Z' }],
};
const account = {
  accountType: 'office', accountId: 12, who: 'Samatta Ofisi', phone: '0712000000', owed: 22500, legacy: 0, late: true,
  jobs: 42, earned: 245000, fees: 24500, free: 20, firstJobAt: '2026-11-03T10:00:00Z', lastRemindedAt: null,
  invoices: [{ id: 6, number: 'KX-202611-O0012', month: 'Novemba 2026', amount: 24500, paid: 2000, left: 22500, status: 'part', late: true, jobs: 42, dueAt: '2026-12-30' }],
  payments: [{ id: 3, amount: 2000, status: 'confirmed', createdAt: '2026-11-20T10:00:00Z' }], recent: [],
};

test('Akaunti: who uses KenteXa, what they owe, who is late; one account shows ankara and Mkumbushe (owner 2026-11-17)', async () => {
  api.get.mockImplementation((url) => Promise.resolve({ data: url.endsWith('/admin/payments') ? [] : url.endsWith('/admin/accounts') ? accounts : account }));
  api.post.mockResolvedValue({ data: { ok: true } });
  await act(async () => { render(<AdminKentexaFees activePage="AdminKentexaFees" onNavigate={jest.fn()} onLogout={jest.fn()} />); });
  await act(async () => { fireEvent.click(screen.getByTestId('fee-tab-accounts')); });
  expect(api.get).toHaveBeenCalledWith('/kentexa-fee/admin/accounts', { params: { filter: 'owing', q: undefined } });
  const list = screen.getByTestId('fee-accounts');
  expect(list).toHaveTextContent('Samatta Ofisi');
  expect(list).toHaveTextContent('TZS 22,500');
  expect(list).toHaveTextContent('Imechelewa');
  await act(async () => { fireEvent.click(screen.getByTestId('fee-account-office-12')); });
  expect(api.get).toHaveBeenCalledWith('/kentexa-fee/admin/accounts/office/12');
  const one = screen.getByTestId('fee-account');
  expect(one).toHaveTextContent('KX-202611-O0012');
  expect(one).toHaveTextContent('imebaki TZS 22,500');
  await act(async () => { fireEvent.click(screen.getByTestId('fee-remind')); });
  expect(api.post).toHaveBeenCalledWith('/kentexa-fee/admin/accounts/office/12/remind');
  expect(screen.getByRole('status')).toHaveTextContent('Kumbusho limetumwa');
});
