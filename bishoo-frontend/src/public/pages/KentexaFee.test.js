import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import KentexaFee, { ruleText } from './KentexaFee';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
jest.mock('../components/BackBar', () => () => null);

const mine = {
  ready: true, as: 'office', name: 'Samatta', owed: 24500, legacy: 0, inArrears: false, waiting: 0,
  month: { jobs: 42, earned: 245000, fee: 24500, free: 0 }, freeLeft: 0,
  rule: { rate: 10, min: 200, cap: 5000 }, lipa: { number: '10473656887', name: 'Bishoo System', bank: 'CRDB' },
  recent: [], payments: [],
};

test('Ada ya KenteXa: the debt and this month from the server; Lipa deni shows the Lipa Namba (owner approved 2026-11-03)', async () => {
  api.get.mockResolvedValue({ data: mine });
  await act(async () => { render(<KentexaFee onNavigate={jest.fn()} isLoggedIn navParams={{ as: 'office' }} />); });
  expect(api.get).toHaveBeenCalledWith('/kentexa-fee/mine', { params: { as: 'office' } });
  expect(screen.getByTestId('fee-owed')).toHaveTextContent('TZS 24,500');
  expect(screen.getByText('Vifurushi')).toBeInTheDocument();
  fireEvent.click(screen.getByTestId('fee-pay'));
  const form = screen.getByTestId('fee-pay-form');
  expect(form).toHaveTextContent('10473656887');
  expect(form).toHaveTextContent('Bishoo System');
  expect(screen.getByTestId('fee-amount')).toHaveValue('24500');
});

test('sending a payment: the screenshot is uploaded privately, then the payment is sent for KenteXa to confirm', async () => {
  api.get.mockResolvedValue({ data: mine });
  api.post.mockImplementation((url) => Promise.resolve({ data: url === '/upload/payment-proof' ? { proofId: 'kentexa/payment-proofs/a1.jpg' } : { id: 3, status: 'waiting' } }));
  await act(async () => { render(<KentexaFee onNavigate={jest.fn()} isLoggedIn navParams={{ as: 'office' }} />); });
  fireEvent.click(screen.getByTestId('fee-pay'));
  fireEvent.change(screen.getByTestId('fee-proof'), { target: { files: [new File(['x'], 'pay.jpg', { type: 'image/jpeg' })] } });
  await act(async () => { fireEvent.click(screen.getByText('Tuma')); });
  expect(api.post).toHaveBeenCalledWith('/kentexa-fee/payments', { as: 'office', amount: 24500, proofRef: 'kentexa/payment-proofs/a1.jpg', reference: undefined });
  expect(screen.getByText(/Tunathibitisha ndani ya saa 24/)).toBeInTheDocument();
});

test('the rule in words: ofisi 10% with min and cap; seller 2% and POS free', () => {
  expect(ruleText('office', { rate: 10, min: 200, cap: 5000 })).toBe('10% ya ada ya usafirishaji uliyotoza, angalau TZS 200, isizidi TZS 5,000. Kifurushi cha bure hakilipiwi.');
  expect(ruleText('seller', { rate: 2, min: 0, cap: null })).toMatch(/^2% ya bei ya bidhaa/);
});

test('Ankara: monthly invoices with paid/late tags; opening one shows its jobs and "Lipa ankara hii" fills what is left (owner 2026-11-17)', async () => {
  const withInvoices = {
    ...mine,
    invoices: [
      { id: 7, number: 'KX-202612-O0012', month: 'Desemba 2026', amount: 3000, paid: 500, left: 2500, status: 'part', late: false, jobs: 9, freeJobs: 0, dueAt: '2027-01-30' },
      { id: 6, number: 'KX-202611-O0012', month: 'Novemba 2026', amount: 2000, paid: 2000, left: 0, status: 'paid', late: false, jobs: 6, freeJobs: 2, dueAt: '2026-12-30' },
    ],
  };
  api.get.mockImplementation((url) => Promise.resolve({ data: url === '/kentexa-fee/mine' ? withInvoices
    : { jobs: [{ id: 1, sourceRef: 'WB-1', baseAmount: 5000, fee: 500, freeJob: false, doneAt: '2026-12-02T10:00:00Z' }] } }));
  await act(async () => { render(<KentexaFee onNavigate={jest.fn()} isLoggedIn navParams={{ as: 'office' }} />); });
  const list = screen.getByTestId('fee-invoices');
  expect(list).toHaveTextContent('Desemba 2026');
  expect(list).toHaveTextContent('Imelipwa sehemu');
  expect(list).toHaveTextContent('Imelipwa');
  await act(async () => { fireEvent.click(screen.getByTestId('fee-invoice-7')); });
  expect(api.get).toHaveBeenCalledWith('/kentexa-fee/invoices/7', { params: { as: 'office' } });
  expect(screen.getByTestId('fee-invoice-detail')).toHaveTextContent('WB-1');
  fireEvent.click(screen.getByTestId('fee-pay-invoice'));
  expect(screen.getByTestId('fee-amount')).toHaveValue('2500');
});
