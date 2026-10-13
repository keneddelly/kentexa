import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import PostService from './PostService';
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

const user = { name: 'Juma', phone: '255712345678', city: 'Arusha' };
const btn = (name) => screen.getByRole('button', { name });
const setup = async (identity) => {
  api.get.mockImplementation(async (url) => (url === '/identity/me' ? { data: { status: identity } } : { data: null }));
  const onNavigate = jest.fn();
  await act(async () => { render(<PostService isLoggedIn currentUser={user} onNavigate={onNavigate} />); });
  return onNavigate;
};
const fillAndSend = async () => {
  api.post.mockImplementation(async (url) => (url === '/upload/images' ? { data: { urls: ['https://x/p.jpg'] } } : null));
  fireEvent.click(btn(sw.post_service.cat_ufundi));
  fireEvent.change(screen.getByPlaceholderText(sw.post_service.field_title_placeholder), { target: { value: 'Fundi wa umeme' } });
  fireEvent.change(screen.getByPlaceholderText(sw.post_service.field_description_placeholder), { target: { value: 'Nyumba na ofisi.' } });
  fireEvent.change(screen.getByPlaceholderText(sw.service_signup.price_placeholder), { target: { value: '20000' } });
  const file = new File(['x'], 'p.jpg', { type: 'image/jpeg' });
  await act(async () => { fireEvent.change(screen.getByTestId('service-photo-input'), { target: { files: [file] } }); });
};

test('no ID yet: only the ID screen, no form', async () => {
  await setup('not_submitted');
  expect(screen.getByTestId('service-identity-step')).toBeInTheDocument();
  expect(screen.queryByTestId('service-form')).toBeNull();
});

test('ONE screen: area and WhatsApp come from the account (shown, not asked); working days are folded away', async () => {
  await setup('verified');
  expect(screen.getByTestId('service-account-line')).toHaveTextContent('Eneo: Arusha');
  expect(screen.getByTestId('service-account-line')).toHaveTextContent('WhatsApp: 255712345678');
  expect(screen.queryByPlaceholderText('0788 000 000')).toBeNull();                      // no WhatsApp box
  expect(screen.getByText(sw.service_signup.more_details).closest('details')).not.toHaveAttribute('open');
  expect(btn(sw.post_service.submit_button)).toBeDisabled();
});

test('ID waiting: may post; the ad waits for the ID and the poster is told so', async () => {
  await setup('pending');
  expect(screen.getByText(sw.service_signup.identity_waiting_note)).toBeInTheDocument();
  await fillAndSend();
  api.post.mockImplementation(async (url) => (url === '/services' ? { data: { id: 9, waitingForId: true } } : { data: { urls: [] } }));
  await act(async () => { fireEvent.click(btn(sw.post_service.submit_button)); });
  expect(api.post).toHaveBeenCalledWith('/services', expect.objectContaining({
    category: 'ufundi', title: 'Fundi wa umeme', priceType: 'per_job', price: 20000,
    coverageCity: 'Arusha', whatsappPhone: '255712345678', images: ['https://x/p.jpg'],
  }));
  expect(screen.getByTestId('service-waiting-id')).toHaveTextContent(sw.work_roles.status_waiting_id);
});

test('verified: the posted ad opens directly', async () => {
  const onNavigate = await setup('verified');
  await fillAndSend();
  api.post.mockImplementation(async (url) => (url === '/services' ? { data: { id: 9, waitingForId: false } } : { data: { urls: [] } }));
  await act(async () => { fireEvent.click(btn(sw.post_service.submit_button)); });
  expect(onNavigate).toHaveBeenCalledWith('ServiceDetail-9');
});
