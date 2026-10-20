import React from 'react';
import { render, screen } from '@testing-library/react';
import { DirectPaymentSuccess } from './DirectPayment';
import sw from '../../locales/sw.json';

jest.mock('react-i18next', () => {
  const texts = require('../../locales/sw.json');
  return { useTranslation: () => ({ t: (key, vars) => {
    const v = key.split('.').reduce((o, k) => (o ? o[k] : undefined), texts) ?? key;
    return String(v).replace(/\{\{(\w+)\}\}/g, (_m, k) => (vars && vars[k] != null ? vars[k] : ''));
  } }) };
});
jest.mock('../../api/api', () => ({ get: jest.fn(), patch: jest.fn(), post: jest.fn() }));

const url = 'https://wa.me/255754000111?text=KenteXa%3A%20Agizo%20jipya%20%23901%2C%20%23902.';

test('seller with a WhatsApp number: one button opening wa.me with the message pre-filled', () => {
  render(<DirectPaymentSuccess method="cod" total={450000} onNavigate={() => {}}
    whatsapp={[{ sellerId: 2, storeName: 'Bishoo intelligence system', orderIds: [901, 902], whatsappUrl: url }]} />);
  const button = screen.getByTestId('whatsapp-seller');
  expect(button).toHaveAttribute('href', url);
  expect(button).toHaveAttribute('target', '_blank');
  expect(button).toHaveTextContent(sw.direct_payment.whatsapp_send);
  expect(screen.getByText(sw.direct_payment.whatsapp_note)).toBeInTheDocument();
});

test('no seller WhatsApp number on file: no button and no note', () => {
  render(<DirectPaymentSuccess method="cod" total={450000} onNavigate={() => {}} whatsapp={[]} />);
  expect(screen.queryByTestId('whatsapp-seller')).toBeNull();
  expect(screen.queryByText(sw.direct_payment.whatsapp_note)).toBeNull();
});

test('two sellers with WhatsApp: one button each, named by store', () => {
  render(<DirectPaymentSuccess method="lipa_namba" total={1} onNavigate={() => {}} whatsapp={[
    { sellerId: 2, storeName: 'Duka A', orderIds: [1], whatsappUrl: url },
    { sellerId: 9, storeName: 'Duka B', orderIds: [2], whatsappUrl: url },
  ]} />);
  const buttons = screen.getAllByTestId('whatsapp-seller');
  expect(buttons).toHaveLength(2);
  expect(buttons[1]).toHaveTextContent('Tuma kwa Duka B kwa WhatsApp');
});
