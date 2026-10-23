import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DirectPaymentSuccess, LipaPaymentStep } from './DirectPayment';
import api from '../../api/api';
import sw from '../../locales/sw.json';

jest.mock('react-i18next', () => {
  const texts = require('../../locales/sw.json');
  return { useTranslation: () => ({ t: (key, vars) => {
    const v = key.split('.').reduce((o, k) => (o ? o[k] : undefined), texts) ?? key;
    return String(v).replace(/\{\{(\w+)\}\}/g, (_m, k) => (vars && vars[k] != null ? vars[k] : ''));
  } }) };
});
jest.mock('../../api/api', () => ({ get: jest.fn(), patch: jest.fn(), post: jest.fn() }));

const dp = sw.direct_payment;
const url = 'https://wa.me/255754000111?text=KenteXa%3A%20Agizo%20jipya%20%23901%2C%20%23902.';
const notice = (over = {}) => ({ sellerId: 2, storeName: 'Bishoo intelligence system', orderIds: [901, 902], whatsappUrl: url, phone: '255700000002', ...over });

describe('confirmation screen: seller contact', () => {
  test('seller with WhatsApp: the order summary pre-filled on WhatsApp, and the phone with a call button', () => {
    render(<DirectPaymentSuccess method="lipa_namba" total={450000} onNavigate={() => {}} notices={[notice()]} />);
    const button = screen.getByTestId('whatsapp-seller');
    expect(button).toHaveAttribute('href', url);
    expect(button).toHaveAttribute('target', '_blank');
    expect(button).toHaveTextContent(dp.whatsapp_send);
    expect(screen.getByText(dp.whatsapp_note)).toBeInTheDocument();
    expect(screen.getByTestId('seller-phone')).toHaveTextContent('255700000002');
    expect(screen.getByTestId('call-seller')).toHaveAttribute('href', 'tel:255700000002');
    expect(screen.queryByTestId('no-whatsapp-note')).toBeNull();
    expect(screen.getByText(/Malipo yako ya TZS 450,000 yamethibitishwa/)).toBeInTheDocument();
  });

  test('seller without WhatsApp (Lipa): the phone alone, with a note to send the payment slip to it', () => {
    render(<DirectPaymentSuccess method="lipa_namba" total={1} onNavigate={() => {}} notices={[notice({ whatsappUrl: null })]} />);
    expect(screen.queryByTestId('whatsapp-seller')).toBeNull();
    expect(screen.getByTestId('call-seller')).toHaveAttribute('href', 'tel:255700000002');
    expect(screen.getByTestId('no-whatsapp-note')).toHaveTextContent(dp.no_whatsapp_note);
  });

  test('no WhatsApp and no phone on file: no contact block', () => {
    render(<DirectPaymentSuccess method="cod" total={1} onNavigate={() => {}} notices={[notice({ whatsappUrl: null, phone: null })]} />);
    expect(screen.queryByTestId('seller-contact')).toBeNull();
  });

  test('two sellers: one contact each, named by store', () => {
    render(<DirectPaymentSuccess method="cod" total={1} onNavigate={() => {}} notices={[
      notice({ storeName: 'Duka A' }), notice({ sellerId: 9, storeName: 'Duka B', phone: '255711111111' }),
    ]} />);
    expect(screen.getAllByTestId('seller-contact')).toHaveLength(2);
    expect(screen.getByText('Duka B')).toBeInTheDocument();
  });
});

describe('Lipa payment step', () => {
  const quote = { place: 'Kariakoo, Ilala, Dar es Salaam', total: 24000, sellers: [
    { sellerId: 2, storeName: 'Duka A', total: 24000, lipaNamba: { number: '55771234', name: 'Juma Shop' }, items: [] },
  ] };

  test('shows the seller\'s Lipa Namba, name and exact amount; confirm stays off until a screenshot is uploaded', async () => {
    const onProofChange = jest.fn();
    const onConfirm = jest.fn();
    const { rerender } = render(<LipaPaymentStep quote={quote} proofs={{}} onProofChange={onProofChange} onConfirm={onConfirm} onBack={() => {}} />);
    expect(screen.getByTestId('lipa-namba-box')).toHaveTextContent('55771234');
    expect(screen.getByText('Juma Shop')).toBeInTheDocument();
    expect(screen.getByTestId('lipa-amount')).toHaveTextContent('TZS 24,000');
    expect(screen.getByTestId('confirm-payment')).toBeDisabled();
    expect(screen.getByTestId('confirm-payment')).toHaveTextContent(dp.confirm_payment);

    api.post.mockResolvedValueOnce({ data: { proofId: 'kentexa/payment-proofs/abc123.jpg' } });
    URL.createObjectURL = jest.fn(() => 'blob:slip');
    const file = new File(['x'], 'slip.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByTestId('proof-2'), { target: { files: [file] } });
    await waitFor(() => expect(onProofChange).toHaveBeenCalledWith(2, { proofId: 'kentexa/payment-proofs/abc123.jpg', preview: 'blob:slip' }));
    expect(api.post).toHaveBeenCalledWith('/upload/payment-proof', expect.any(FormData), expect.anything());

    fireEvent.change(screen.getByTestId('reference-2'), { target: { value: 'QX12' } });
    expect(onProofChange).toHaveBeenCalledWith(2, { reference: 'QX12' });

    rerender(<LipaPaymentStep quote={quote} proofs={{ 2: { proofId: 'kentexa/payment-proofs/abc123.jpg', preview: 'blob:slip' } }}
      onProofChange={onProofChange} onConfirm={onConfirm} onBack={() => {}} />);
    fireEvent.click(screen.getByTestId('confirm-payment'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
