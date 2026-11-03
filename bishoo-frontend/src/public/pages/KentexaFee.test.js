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
