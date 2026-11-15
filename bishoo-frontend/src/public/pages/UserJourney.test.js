import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import PublicLogin from './PublicLogin';
import Register from './Register';
import api from '../../api/api';
import { authErrorCode, authErrorText } from '../utils/authErrors';
import { queueEvent, flushEvents, FLUSH_AT, FLUSH_MS, __resetAnalyticsQueueForTests } from '../hooks/useAnalytics';

jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
const mockT = (k, v) => (v && Object.keys(v).length ? `${k}:${JSON.stringify(v)}` : k);
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockT, i18n: { language: 'sw', changeLanguage: jest.fn() } }) }));
jest.mock('../components/LanguageSwitcher', () => () => null);
beforeEach(() => { api.get.mockReset(); api.post.mockReset(); api.get.mockResolvedValue({ data: null }); });

const type = (id, value) => fireEvent.change(screen.getByTestId(id), { target: { value } });
const fail = (status, data) => ({ response: { status, data } });

describe('issue #361: errors in the person\'s language', () => {
  test('a server code is translated; English messages never reach the screen', () => {
    expect(authErrorCode(fail(400, { code: 'OTP_WRONG', message: 'Incorrect OTP. 2 attempts remaining.', remaining: 2 }))).toBe('OTP_WRONG');
    expect(authErrorText(fail(400, { code: 'OTP_WRONG', remaining: 2 }), mockT, 'x')).toBe('signin.errors.OTP_WRONG:{"remaining":2}');
    expect(authErrorText(fail(429, { message: 'ThrottlerException: Too Many Requests' }), mockT, 'x')).toBe('signin.errors.TOO_MANY_REQUESTS');
    expect(authErrorText({ request: {}, message: 'Network Error' }, mockT, 'x')).toBe('signin.errors.NETWORK');
    expect(authErrorText(fail(400, { message: ['phone must be longer than or equal to 9 characters'] }), mockT, 'signin.register_failed')).toBe('signin.register_failed');
    expect(authErrorText(fail(400, { message: 'Phone number already registered' }), mockT, 'signin.register_failed')).toBe('signin.register_failed');
    expect(authErrorText(fail(400, { message: 'Weka namba sahihi ya simu (mf. 0712345678).' }), mockT, 'x')).toBe('Weka namba sahihi ya simu (mf. 0712345678).');
  });
});

describe('issue #361: an account that never typed its code', () => {
  test('signing in opens the code step, and the code signs the person in', async () => {
    const onLoginSuccess = jest.fn();
    api.post.mockImplementation((url) => {
      if (url === '/auth/login') return Promise.reject(fail(401, { code: 'ACCOUNT_NOT_VERIFIED', identifier: '255712345678', otpSent: true }));
      if (url === '/auth/verify-otp') return Promise.resolve({ data: { accessToken: 'ok' } });
      return Promise.resolve({ data: {} });
    });
    render(<PublicLogin onNavigate={jest.fn()} onLoginSuccess={onLoginSuccess} />);
    type('login-identifier', '0712345678'); type('login-password', 'siri123');
    await act(async () => { fireEvent.click(screen.getByTestId('login-submit')); });
    expect(screen.getByText('signin.finish_title')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('signin.errors.ACCOUNT_NOT_VERIFIED');
    expect(screen.queryByTestId('sms-not-sent')).toBeNull();
    type('verify-code', '123456');
    await act(async () => { fireEvent.click(screen.getByTestId('login-verify')); });
    expect(api.post).toHaveBeenLastCalledWith('/auth/verify-otp', { identifier: '255712345678', otp: '123456' });
    expect(onLoginSuccess).toHaveBeenCalledWith({ accessToken: 'ok' }, { targetPage: 'AddProfilePhoto' });
  });

  test('when the SMS did not go out, the page says so and offers help', async () => {
    api.post.mockRejectedValueOnce(fail(401, { code: 'ACCOUNT_NOT_VERIFIED', identifier: '255712345678', otpSent: false }));
    render(<PublicLogin onNavigate={jest.fn()} onLoginSuccess={jest.fn()} />);
    type('login-identifier', '0712345678'); type('login-password', 'siri123');
    await act(async () => { fireEvent.click(screen.getByTestId('login-submit')); });
    expect(screen.getByTestId('sms-not-sent')).toHaveTextContent('signin.sms_not_sent');
    expect(screen.getByTestId('auth-help')).toBeInTheDocument();
  });
});

describe('issue #361: registration', () => {
  test('a failed SMS is said plainly on the code step', async () => {
    api.post.mockResolvedValue({ data: { otpSent: false } });
    render(<Register onNavigate={jest.fn()} onLoginSuccess={jest.fn()} />);
    type('register-name', 'Juma'); type('register-contact', '0712345678'); type('register-password', 'siri123');
    await act(async () => { fireEvent.click(screen.getByTestId('register-submit')); });
    expect(screen.getByTestId('sms-not-sent')).toBeInTheDocument();
  });

  test('a number that already has an account gets a translated message', async () => {
    api.post.mockRejectedValue(fail(409, { code: 'PHONE_TAKEN', message: 'Phone number already registered' }));
    render(<Register onNavigate={jest.fn()} onLoginSuccess={jest.fn()} />);
    type('register-name', 'Juma'); type('register-contact', '0712345678'); type('register-password', 'siri123');
    await act(async () => { fireEvent.click(screen.getByTestId('register-submit')); });
    expect(screen.getByRole('alert')).toHaveTextContent('signin.errors.PHONE_TAKEN');
  });

  test('"Unahitaji msaada?" sends the phone, step and error, never the password', async () => {
    api.post.mockRejectedValueOnce(fail(409, { code: 'PHONE_TAKEN' })).mockResolvedValue({ data: { ok: true } });
    render(<Register onNavigate={jest.fn()} onLoginSuccess={jest.fn()} />);
    type('register-name', 'Juma'); type('register-contact', '0712345678'); type('register-password', 'siri123');
    await act(async () => { fireEvent.click(screen.getByTestId('register-submit')); });
    fireEvent.click(screen.getByTestId('auth-help'));
    expect(screen.getByTestId('auth-help-phone')).toHaveValue('0712345678');
    await act(async () => { fireEvent.click(screen.getByTestId('auth-help-send')); });
    expect(api.post).toHaveBeenLastCalledWith('/contact/help', { phone: '0712345678', name: 'Juma', step: 'register', errorCode: 'PHONE_TAKEN', note: '' });
    expect(JSON.stringify(api.post.mock.calls.at(-1))).not.toContain('siri123');
    expect(screen.getByTestId('auth-help-sent')).toBeInTheDocument();
  });
});

describe('issue #361: analytics in small groups', () => {
  beforeEach(() => { __resetAnalyticsQueueForTests(); jest.useFakeTimers(); api.post.mockResolvedValue({ data: { ok: true } }); });
  afterEach(() => jest.useRealTimers());

  test('events go out together after 10 seconds, not one call each', async () => {
    queueEvent({ sessionId: 's', eventType: 'page_view' });
    queueEvent({ sessionId: 's', eventType: 'scroll' });
    expect(api.post).not.toHaveBeenCalled();
    await act(async () => { jest.advanceTimersByTime(FLUSH_MS); });
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith('/analytics/events', { events: [{ sessionId: 's', eventType: 'page_view' }, { sessionId: 's', eventType: 'scroll' }] });
  });

  test('a full group goes out at once', async () => {
    for (let i = 0; i < FLUSH_AT; i += 1) queueEvent({ sessionId: 's', eventType: 'page_view' });
    await act(async () => { await flushEvents(); });
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post.mock.calls[0][1].events).toHaveLength(FLUSH_AT);
  });
});
