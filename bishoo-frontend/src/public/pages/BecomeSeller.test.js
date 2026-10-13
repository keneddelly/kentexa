import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import BecomeSeller from './BecomeSeller';
import api from '../../api/api';
import sw from '../../locales/sw.json';

jest.mock('react-i18next', () => {
  const texts = require('../../locales/sw.json');
  return { useTranslation: () => ({ t: (key, vars) => {
    const v = key.split('.').reduce((o, k) => (o ? o[k] : undefined), texts) ?? key;
    return String(v).replace(/\{\{(\w+)\}\}/g, (_m, k) => (vars && vars[k] != null ? vars[k] : ''));
  } }) };
});
jest.mock('../../api/api', () => ({ get: jest.fn(), post: jest.fn(), patch: jest.fn() }));
jest.mock('../components/BackBar', () => () => null);
jest.mock('../components/LocationPicker', () => () => <div>location-picker</div>);
jest.mock('../components/VerifyIdentityModal', () => () => <div>identity-modal</div>);
afterEach(() => jest.clearAllMocks());

const user = { name: 'Neema Juma', phone: '255712345678', city: 'Arusha' };
const btn = (name) => screen.getByRole('button', { name });
const setup = async ({ identity = 'verified', seller = null } = {}) => {
  api.get.mockImplementation(async (url) => {
    if (url === '/identity/me') return { data: { status: identity } };
    if (url === '/seller/my-profile') { if (seller) return { data: seller }; throw Object.assign(new Error('404'), { response: { status: 404 } }); }
    return { data: null };
  });
  await act(async () => { render(<BecomeSeller isLoggedIn currentUser={user} onNavigate={jest.fn()} />); });
};

test('no ID yet: only the ID screen, no form', async () => {
  await setup({ identity: 'not_submitted' });
  expect(screen.getByTestId('seller-identity-step')).toBeInTheDocument();
  expect(screen.queryByTestId('seller-form')).toBeNull();
  fireEvent.click(btn(sw.become_seller.identity_verify_button));
  expect(screen.getByText('identity-modal')).toBeInTheDocument();
});

test('individual, ID waiting: ONE screen; phone and place shown from the account, not asked; sends the short request', async () => {
  await setup({ identity: 'pending' });
  api.post.mockResolvedValue({ data: { id: 3, status: 'pending' } });
  expect(screen.getByText(sw.seller_signup.identity_waiting_note)).toBeInTheDocument();
  expect(screen.getByTestId('seller-account-line')).toHaveTextContent('Simu: 255712345678');
  expect(screen.getByTestId('seller-account-line')).toHaveTextContent('Mahali: Arusha');
  expect(screen.getAllByRole('textbox')).toHaveLength(1);              // only the (optional) store name
  expect(btn(sw.become_seller.submit_button)).toBeDisabled();          // category first
  fireEvent.click(btn(sw.stores.cat_fashion));
  await act(async () => { fireEvent.click(btn(sw.become_seller.submit_button)); });
  expect(api.post).toHaveBeenCalledWith('/seller/apply', {
    sellerType: 'individual', businessName: undefined, businessCategory: 'fashion',
    phone: '255712345678', address: 'Arusha', businessRegion: 'Arusha',
  });
  // sent: the waiting status, saying the ID comes first
  expect(screen.getByTestId('seller-status')).toHaveTextContent(sw.work_roles.status_waiting_id);
});

test('business: one more screen for the papers; BRELA and TIN documents are required', async () => {
  await setup();
  fireEvent.click(btn(new RegExp(sw.become_seller.seller_type_business_title)));
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Juma Traders' } });
  fireEvent.click(btn(sw.stores.cat_hardware));
  fireEvent.click(btn(sw.seller_signup.next_papers));
  expect(screen.getByTestId('seller-papers')).toBeInTheDocument();
  await act(async () => { fireEvent.click(btn(sw.become_seller.submit_button)); });
  expect(api.post).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toHaveTextContent(sw.become_seller.business_documents_required);
});

test('an existing request shows its status instead of the form', async () => {
  await setup({ identity: 'verified', seller: { id: 3, status: 'pending' } });
  expect(screen.getByTestId('seller-status')).toHaveTextContent(sw.work_roles.status_waiting);
  expect(screen.queryByTestId('seller-form')).toBeNull();
});
