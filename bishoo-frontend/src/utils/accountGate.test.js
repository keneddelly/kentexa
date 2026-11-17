import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { missingForPage } from './accountGate';
import CompleteAccount from '../public/pages/CompleteAccount';
import api from '../api/api';

jest.mock('../api/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));

// Owner 2026-11-17: phone and region are asked before a feature that needs them, never at sign-up.
test('features that need a phone ask for what is missing; reading never asks', () => {
  expect(missingForPage('SendShipment', { phone: null, city: null })).toEqual(['phone', 'city']);
  expect(missingForPage('BecomeSeller', { phone: '255712345678', city: null })).toEqual(['city']);
  expect(missingForPage('BecomeSeller', { phone: '255712345678', city: 'Arusha' })).toEqual([]);
  expect(missingForPage('Home', { phone: null })).toEqual([]);
  expect(missingForPage('Community-5', { phone: null })).toEqual([]);
  expect(missingForPage('PostDetail-3', { phone: null })).toEqual([]);
});

test('phone and region, then the SMS code; the feature opens after', async () => {
  api.post.mockImplementation((url) => Promise.resolve({ data: url === '/auth/phone/start' ? { ticket: 't1', otpSent: true } : { user: { phone: '255712345678', city: 'Mwanza' } } }));
  const onDone = jest.fn();
  render(<CompleteAccount page="SendShipment" missing={['phone', 'city']} onDone={onDone} onNavigate={jest.fn()} />);
  fireEvent.change(screen.getByTestId('complete-phone'), { target: { value: '0712 345 678' } });
  fireEvent.change(screen.getByTestId('complete-city'), { target: { value: 'Mwanza' } });
  await act(async () => { fireEvent.click(screen.getByTestId('complete-send')); });
  expect(api.post).toHaveBeenCalledWith('/auth/phone/start', { phone: '255712345678' });
  fireEvent.change(screen.getByTestId('complete-code'), { target: { value: '123456' } });
  await act(async () => { fireEvent.click(screen.getByTestId('complete-confirm')); });
  expect(api.post).toHaveBeenCalledWith('/auth/phone/confirm', { ticket: 't1', otp: '123456', city: 'Mwanza' });
  expect(onDone).toHaveBeenCalledWith({ phone: '255712345678', city: 'Mwanza' });
});

test('only the region missing: one quick question', async () => {
  api.post.mockResolvedValue({ data: { user: { city: 'Arusha' } } });
  const onDone = jest.fn();
  render(<CompleteAccount page="BecomeSeller" missing={['city']} onDone={onDone} onNavigate={jest.fn()} />);
  fireEvent.change(screen.getByTestId('complete-city'), { target: { value: 'Arusha' } });
  await act(async () => { fireEvent.click(screen.getByTestId('complete-city-save')); });
  expect(api.post).toHaveBeenCalledWith('/auth/city', { city: 'Arusha' });
  expect(onDone).toHaveBeenCalledWith({ city: 'Arusha' });
});
