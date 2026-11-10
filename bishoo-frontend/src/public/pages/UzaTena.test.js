import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import api from '../../api/api';
import UzaTena from './UzaTena';
import { pageToPath, pathToPage } from '../../utils/urlSync';

jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn() } }));

test('the public page: live counts (no prices), an example labelled as one, and join goes to sign-up then Uza tena', async () => {
  api.get.mockResolvedValue({ data: { shops: 3, products: 40 } });
  localStorage.removeItem('kentexa_after_login');
  const onNavigate = jest.fn();
  await act(async () => { render(<UzaTena onNavigate={onNavigate} isLoggedIn={false} />); });
  expect(screen.getByTestId('uza-stats')).toHaveTextContent('Maduka 3 · bidhaa 40');
  expect(screen.getByTestId('uza-example')).toHaveTextContent('Huu ni mfano tu');
  fireEvent.click(screen.getByTestId('uza-join'));
  expect(localStorage.getItem('kentexa_after_login')).toBe('MyResales');
  expect(onNavigate).toHaveBeenCalledWith('Register');
});

test('signed in, join opens the catalogue; the page has its own address', async () => {
  api.get.mockResolvedValue({ data: { shops: 0, products: 0 } });
  const onNavigate = jest.fn();
  await act(async () => { render(<UzaTena onNavigate={onNavigate} isLoggedIn />); });
  expect(screen.queryByTestId('uza-stats')).toBeNull();
  fireEvent.click(screen.getByTestId('uza-join'));
  expect(onNavigate).toHaveBeenCalledWith('MyResales', { tab: 'open' });
  expect(pageToPath('UzaTena')).toBe('/uza-tena');
  expect(pathToPage('/uza-tena/')).toBe('UzaTena');
  expect(pathToPage('/product/3-simu')).toBe('ProductDetail-3');
});
