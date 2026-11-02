import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import PublicLogin from './PublicLogin';
import Register from './Register';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
const mockT = (k, v) => (v ? `${k}:${JSON.stringify(v)}` : k);
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockT, i18n: { language: 'sw', changeLanguage: jest.fn() } }) }));
jest.mock('../components/LanguageSwitcher', () => () => null);
beforeEach(() => { api.get.mockReset(); api.post.mockReset(); });

const type = (id, value) => fireEvent.change(screen.getByTestId(id), { target: { value } });

test('login (owner approved 2026-11-02): one field; a phone typed with 0 is sent as 255, an "@" as email', async () => {
  api.post.mockResolvedValue({ data: { accessToken: 'x' } });
  const onLoginSuccess = jest.fn();
  render(<PublicLogin onNavigate={jest.fn()} onLoginSuccess={onLoginSuccess} />);
  type('login-identifier', '0712 345 678'); type('login-password', 'siri123');
  await act(async () => { fireEvent.click(screen.getByTestId('login-submit')); });
  expect(api.post).toHaveBeenLastCalledWith('/auth/login', { phone: '255712345678', password: 'siri123' });
  expect(onLoginSuccess).toHaveBeenCalledWith({ accessToken: 'x' });
  type('login-identifier', 'juma@mfano.com');
  await act(async () => { fireEvent.click(screen.getByTestId('login-submit')); });
  expect(api.post).toHaveBeenLastCalledWith('/auth/login', { email: 'juma@mfano.com', password: 'siri123' });
});

test('login: a wrong password shows the server message as plain text', async () => {
  api.post.mockRejectedValue({ response: { data: { message: 'Namba au nenosiri si sahihi.' } } });
  render(<PublicLogin onNavigate={jest.fn()} onLoginSuccess={jest.fn()} />);
  type('login-identifier', '0712345678'); type('login-password', 'x123456');
  await act(async () => { fireEvent.click(screen.getByTestId('login-submit')); });
  expect(screen.getByRole('alert')).toHaveTextContent('Namba au nenosiri si sahihi.');
});

test('forgot password: send the code, then the code and a new password', async () => {
  api.post.mockResolvedValue({ data: {} });
  render(<PublicLogin onNavigate={jest.fn()} onLoginSuccess={jest.fn()} />);
  fireEvent.click(screen.getByTestId('login-forgot'));
  type('login-identifier', '0712345678');
  await act(async () => { fireEvent.click(screen.getByTestId('forgot-send')); });
  expect(api.post).toHaveBeenLastCalledWith('/auth/forgot-password', { identifier: '255712345678' });
  type('reset-code', '48a2913'); type('reset-password', 'mpya123');
  await act(async () => { fireEvent.click(screen.getByTestId('reset-submit')); });
  expect(api.post).toHaveBeenLastCalledWith('/auth/reset-password', { identifier: '255712345678', otp: '482913', newPassword: 'mpya123' });
  expect(screen.getByRole('status')).toHaveTextContent('signin.reset_done');
});

test('signup: name, phone, password, then the 6-digit code; email can be used instead', async () => {
  api.post.mockResolvedValue({ data: { accessToken: 'y' } });
  const onLoginSuccess = jest.fn();
  render(<Register onNavigate={jest.fn()} onLoginSuccess={onLoginSuccess} />);
  type('register-name', 'Juma Bakari'); type('register-contact', '0712345678'); type('register-password', 'siri123');
  await act(async () => { fireEvent.click(screen.getByTestId('register-submit')); });
  expect(api.post).toHaveBeenLastCalledWith('/auth/register/phone', { phone: '255712345678', password: 'siri123', name: 'Juma Bakari' });
  expect(screen.getByTestId('register-verify')).toBeDisabled();
  type('code-input', '482913');
  await act(async () => { fireEvent.click(screen.getByTestId('register-verify')); });
  expect(api.post).toHaveBeenLastCalledWith('/auth/verify-otp', { identifier: '255712345678', otp: '482913' });
  expect(onLoginSuccess).toHaveBeenCalledWith({ accessToken: 'y' }, { targetPage: 'AddProfilePhoto' });
});

test('signup: checks before sending; "Badilisha namba" goes back', async () => {
  api.post.mockResolvedValue({ data: {} });
  render(<Register onNavigate={jest.fn()} onLoginSuccess={jest.fn()} />);
  await act(async () => { fireEvent.click(screen.getByTestId('register-submit')); });
  expect(screen.getByRole('alert')).toHaveTextContent('signin.name_required');
  fireEvent.click(screen.getByTestId('register-method'));
  type('register-name', 'Asha'); type('register-contact', 'asha@mfano.com'); type('register-password', 'siri123');
  await act(async () => { fireEvent.click(screen.getByTestId('register-submit')); });
  expect(api.post).toHaveBeenLastCalledWith('/auth/register/email', { email: 'asha@mfano.com', password: 'siri123', name: 'Asha' });
  fireEvent.click(screen.getByTestId('register-change'));
  expect(screen.getByTestId('register-contact')).toHaveValue('asha@mfano.com');
});
