import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LipaPaymentReview from './LipaPaymentReview';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ get: jest.fn(), patch: jest.fn(), post: jest.fn() }));

const waiting = {
  orderId: 181, decision: null, rejectReasonText: null, reference: 'QJK7H2', proofUrl: 'https://res.example/proof.jpg',
  amount: 302000, canConfirm: true, canReject: true, canResend: false,
};

beforeEach(() => { api.get.mockReset(); api.patch.mockReset(); api.post.mockReset(); });

test('seller: sees the screenshot and confirms the payment', async () => {
  api.get.mockResolvedValue({ data: waiting });
  api.patch.mockResolvedValue({ data: { ...waiting, decision: 'confirmed', canConfirm: false, canReject: false } });
  render(<LipaPaymentReview orderId={181} />);
  expect(await screen.findByText('Inasubiri muuzaji athibitishe malipo')).toBeTruthy();
  expect(screen.getByText('Angalia picha ya malipo').getAttribute('href')).toBe('https://res.example/proof.jpg');
  fireEvent.click(screen.getByText('Nimepokea pesa'));
  await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/orders/181/lipa/confirm'));
  expect(await screen.findByText('Malipo yamethibitishwa')).toBeTruthy();
  expect(screen.queryByText('Nimepokea pesa')).toBeNull();
});

test('seller: rejects with a reason', async () => {
  api.get.mockResolvedValue({ data: waiting });
  api.patch.mockResolvedValue({ data: { ...waiting, decision: 'rejected', rejectReasonText: 'picha haisomeki', canReject: false } });
  render(<LipaPaymentReview orderId={181} />);
  fireEvent.click(await screen.findByText('Sijapokea'));
  fireEvent.click(screen.getByText('Picha haisomeki'));
  await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/orders/181/lipa/reject', { reason: 'unclear' }));
  expect(await screen.findByText('Sababu: picha haisomeki')).toBeTruthy();
});

test('buyer after a rejection: sends a new screenshot', async () => {
  api.get.mockResolvedValue({ data: { ...waiting, decision: 'rejected', rejectReasonText: 'kiasi hakilingani na bei', canConfirm: false, canReject: false, canResend: true } });
  api.post
    .mockResolvedValueOnce({ data: { proofId: 'kentexa/payment-proofs/new1.jpg' } })
    .mockResolvedValueOnce({ data: { ...waiting, canConfirm: false, canReject: false } });
  const { container } = render(<LipaPaymentReview orderId={181} />);
  expect(await screen.findByText('Malipo hayajathibitishwa')).toBeTruthy();
  const file = new File(['x'], 'pay.jpg', { type: 'image/jpeg' });
  fireEvent.change(container.querySelector('input[type="file"]'), { target: { files: [file] } });
  fireEvent.click(screen.getByText('Tuma picha'));
  await waitFor(() => expect(api.post).toHaveBeenLastCalledWith('/orders/181/lipa/proof', { proofId: 'kentexa/payment-proofs/new1.jpg', reference: undefined }));
  expect(await screen.findByText('Inasubiri muuzaji athibitishe malipo')).toBeTruthy();
});

test('hidden when the server has not switched it on, or for a non-Lipa order', async () => {
  api.get.mockRejectedValue({ response: { status: 503 } });
  const { container } = render(<LipaPaymentReview orderId={181} />);
  await waitFor(() => expect(api.get).toHaveBeenCalled());
  expect(container.querySelector('[data-testid="lipa-review"]')).toBeNull();
});
