import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { SocialButtons, SocialFinish, resetSocialConfig } from './SocialSignIn';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));

// Ingia kwa Google / Facebook (owner 2026-11-17).
beforeEach(() => { resetSocialConfig(); delete window.FB; delete window.google; });

test('no keys on the server: no buttons at all', async () => {
  api.get.mockResolvedValue({ data: { google: null, facebook: null } });
  await act(async () => { render(<SocialButtons onResult={jest.fn()} />); });
  expect(api.get).toHaveBeenCalledWith('/auth/social/config');
  expect(screen.queryByTestId('social-buttons')).toBeNull();
});

test('Facebook: the token goes to the server, and its answer to the page', async () => {
  api.get.mockResolvedValue({ data: { google: null, facebook: '123' } });
  api.post.mockResolvedValue({ data: { status: 'need_phone', ticket: 't1', name: 'Juma Ally', provider: 'facebook' } });
  window.FB = { init: jest.fn(), login: (cb) => cb({ authResponse: { accessToken: 'fbtok' } }) };
  const onResult = jest.fn();
  await act(async () => { render(<SocialButtons onResult={onResult} />); });
  await act(async () => { fireEvent.click(screen.getByTestId('social-facebook')); });
  expect(window.FB.init).toHaveBeenCalledWith(expect.objectContaining({ appId: '123' }));
  expect(api.post).toHaveBeenCalledWith('/auth/social', { provider: 'facebook', token: 'fbtok', deviceId: undefined });
  expect(onResult).toHaveBeenCalledWith({ status: 'need_phone', ticket: 't1', name: 'Juma Ally', provider: 'facebook' });
});

test('Google: its own button is drawn with our client id', async () => {
  api.get.mockResolvedValue({ data: { google: 'web-1', facebook: null } });
  window.google = { accounts: { id: { initialize: jest.fn(), renderButton: jest.fn() } } };
  await act(async () => { render(<SocialButtons onResult={jest.fn()} />); });
  expect(window.google.accounts.id.initialize).toHaveBeenCalledWith(expect.objectContaining({ client_id: 'web-1' }));
  expect(window.google.accounts.id.renderButton).toHaveBeenCalled();
});

test('a new person: phone once, then the SMS code signs in', async () => {
  const onLoginSuccess = jest.fn();
  api.post.mockImplementation((url) => Promise.resolve({ data: url === '/auth/social/phone'
    ? { status: 'otp_sent', phone: '255712345678', existing: false, otpSent: true }
    : { accessToken: 'a', user: { id: 5 } } }));
  render(<SocialFinish info={{ ticket: 't1', name: 'Juma Ally', provider: 'google' }} onLoginSuccess={onLoginSuccess} onCancel={jest.fn()} />);
  fireEvent.change(screen.getByTestId('social-phone'), { target: { value: '0712 345 678' } });
  await act(async () => { fireEvent.click(screen.getByTestId('social-phone-send')); });
  expect(api.post).toHaveBeenCalledWith('/auth/social/phone', { ticket: 't1', phone: '255712345678' });
  fireEvent.change(screen.getByTestId('social-code'), { target: { value: '123456' } });
  await act(async () => { fireEvent.click(screen.getByTestId('social-verify')); });
  expect(api.post).toHaveBeenCalledWith('/auth/social/verify', { ticket: 't1', phone: '255712345678', otp: '123456' });
  expect(onLoginSuccess).toHaveBeenCalledWith({ accessToken: 'a', user: { id: 5 } }, { targetPage: 'AddProfilePhoto' });
});
