import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import VerifyReceipt from './VerifyReceipt';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k) => k, i18n: { language: 'sw' } }) }));
jest.mock('../components/BackBar', () => () => null);

test('a real receipt: amount and facts from the server (owner 2026-11-02 new look)', async () => {
  api.get.mockResolvedValue({ data: { valid: true, receiptNumber: 'RCP-9', invoiceNumber: 'INV-4', orderId: 12, amount: 45000, paymentMethod: 'M-Pesa', paidAt: '2026-11-02T10:00:00Z' } });
  render(<VerifyReceipt onNavigate={jest.fn()} />);
  fireEvent.change(screen.getByTestId('receipt-number'), { target: { value: ' RCP-9 ' } });
  await act(async () => { fireEvent.click(screen.getByTestId('receipt-verify')); });
  expect(api.get).toHaveBeenCalledWith('/invoices/verify/RCP-9');
  const box = screen.getByTestId('receipt-valid');
  expect(box).toHaveTextContent('TZS 45,000');
  expect(box).toHaveTextContent('INV-4');
  // The public check no longer shows the order number or a PDF link (owner 2026-11-09 audit).
  expect(box).not.toHaveTextContent('#12');
  expect(screen.queryByText('verify_receipt.download_pdf_button')).toBeNull();
});

test('not a real receipt: the server reason; empty number is asked for first', async () => {
  render(<VerifyReceipt onNavigate={jest.fn()} />);
  fireEvent.click(screen.getByTestId('receipt-verify'));
  expect(screen.getByRole('alert')).toHaveTextContent('verify_receipt.receipt_number_required');
  api.get.mockResolvedValue({ data: { valid: false, message: 'Risiti hii haipo.' } });
  fireEvent.change(screen.getByTestId('receipt-number'), { target: { value: 'X1' } });
  await act(async () => { fireEvent.click(screen.getByTestId('receipt-verify')); });
  expect(screen.getByTestId('receipt-invalid')).toHaveTextContent('Risiti hii haipo.');
});
