import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import api from '../../api/api';
import GuestCheckout from './GuestCheckout';
import { isCheckoutBuyer, holdWelcomeSteps } from '../../utils/checkoutBuyer';

jest.mock('../../api/api', () => ({ __esModule: true, default: { post: jest.fn() } }));
jest.mock('../components/LanguageSwitcher', () => () => null);
jest.mock('../../context/CartContext', () => ({
  useCart: () => ({ cart: [{ id: 7, name: 'Simu', quantity: 1, displayPrice: 55000, resaleOfferId: 3 }], cartCount: 1, cartTotal: 55000 }),
}));

beforeEach(() => { api.post.mockReset(); window.sessionStorage.clear(); window.localStorage.clear(); });

const fill = () => {
  fireEvent.change(screen.getByTestId('guest-name'), { target: { value: 'Asha' } });
  fireEvent.change(screen.getByTestId('guest-phone'), { target: { value: '0712 345 678' } });
};

test('a new buyer confirms the phone with one code and goes on to the checkout', async () => {
  const onLoginSuccess = jest.fn();
  api.post.mockImplementation(async (url) => (url === '/auth/checkout-phone' ? { data: { status: 'otp_sent' } } : { data: { accessToken: 't' } }));
  render(<GuestCheckout onNavigate={jest.fn()} onLoginSuccess={onLoginSuccess} />);
  expect(screen.getByTestId('guest-cart')).toHaveTextContent('TZS 55,000');
  fill();
  await act(async () => { fireEvent.click(screen.getByTestId('guest-send')); });
  expect(api.post).toHaveBeenCalledWith('/auth/checkout-phone', { name: 'Asha', phone: '255712345678' });
  fireEvent.change(screen.getByTestId('code-input'), { target: { value: '123456' } });
  await act(async () => { fireEvent.click(screen.getByTestId('guest-verify')); });
  expect(api.post).toHaveBeenCalledWith('/auth/verify-otp', { identifier: '255712345678', otp: '123456' });
  expect(onLoginSuccess).toHaveBeenCalledWith({ accessToken: 't' }, { targetPage: 'Checkout' });
  expect(isCheckoutBuyer()).toBe(true);
  expect(holdWelcomeSteps('Checkout')).toBe(true);
  expect(holdWelcomeSteps('Home')).toBe(false);
});

test('a number that has an account signs in with its password on the same screen', async () => {
  const onLoginSuccess = jest.fn();
  api.post.mockImplementation(async (url) => (url === '/auth/checkout-phone' ? { data: { status: 'has_account' } } : { data: { accessToken: 'p' } }));
  render(<GuestCheckout onNavigate={jest.fn()} onLoginSuccess={onLoginSuccess} />);
  fill();
  await act(async () => { fireEvent.click(screen.getByTestId('guest-send')); });
  expect(screen.getByText('Namba hii ina akaunti')).toBeInTheDocument();
  fireEvent.change(screen.getByTestId('guest-password'), { target: { value: 'siri123' } });
  await act(async () => { fireEvent.click(screen.getByTestId('guest-login')); });
  expect(api.post).toHaveBeenCalledWith('/auth/login', { phone: '255712345678', password: 'siri123' });
  expect(onLoginSuccess).toHaveBeenCalledWith({ accessToken: 'p' }, { targetPage: 'Checkout' });
});

test('a wrong number is caught before any SMS is sent', async () => {
  render(<GuestCheckout onNavigate={jest.fn()} onLoginSuccess={jest.fn()} />);
  fireEvent.change(screen.getByTestId('guest-name'), { target: { value: 'Asha' } });
  fireEvent.change(screen.getByTestId('guest-phone'), { target: { value: '0712' } });
  await act(async () => { fireEvent.click(screen.getByTestId('guest-send')); });
  expect(api.post).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toHaveTextContent('namba sahihi');
});
