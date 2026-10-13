import React from 'react';
import { render, screen } from '@testing-library/react';
import SellerAccessGate from './SellerAccessGate';
import sw from '../../locales/sw.json';

jest.mock('react-i18next', () => {
  const texts = require('../../locales/sw.json');
  return { useTranslation: () => ({ t: (key, vars) => {
    const v = key.split('.').reduce((o, k) => (o ? o[k] : undefined), texts) ?? key;
    return String(v).replace(/\{\{(\w+)\}\}/g, (_m, k) => (vars && vars[k] != null ? vars[k] : ''));
  } }) };
});
jest.mock('./VerifyIdentityModal', () => () => null);
jest.mock('./BackBar', () => () => null);

test('ID waiting: says so, and never offers to send the ID again', () => {
  render(<SellerAccessGate onNavigate={() => {}} identityStatus={{ status: 'pending', level: 0 }} onVerified={() => {}} />);
  expect(screen.getByText(sw.identity_state.waiting_title)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: sw.seller_access_gate.verify_button })).toBeNull();
});

test('ID missing: the send-ID button is there', () => {
  render(<SellerAccessGate onNavigate={() => {}} identityStatus={{ status: 'not_submitted', level: 0 }} onVerified={() => {}} />);
  expect(screen.getByRole('button', { name: sw.seller_access_gate.verify_button })).toBeInTheDocument();
});
