import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import BecomeBusiness from './BecomeBusiness';
import api from '../../api/api';
import sw from '../../locales/sw.json';

jest.mock('react-i18next', () => {
  const texts = require('../../locales/sw.json');
  return { useTranslation: () => ({ t: (key) => key.split('.').reduce((o, k) => (o ? o[k] : undefined), texts) ?? key }) };
});
jest.mock('../../api/api', () => ({ get: jest.fn(), post: jest.fn() }));
jest.mock('../components/BackBar', () => () => null);
jest.mock('../components/LocationPicker', () => () => null);

const T = sw.become_business;
beforeEach(() => { localStorage.clear(); jest.clearAllMocks(); });

const open = async (props, businesses = []) => {
  api.get.mockImplementation(async (url) => (url === '/business/mine/all' ? { data: businesses } : { data: null }));
  const onNavigate = jest.fn();
  await act(async () => { render(<BecomeBusiness currentUser={{ phone: '255712345678' }} onNavigate={onNavigate} {...props} />); });
  return onNavigate;
};

test('a new business opens on its own capability page, like "Biashara zangu" (owner 2026-11-01)', async () => {
  api.post.mockResolvedValue({ data: { id: 42 } });
  const onNavigate = await open({ isLoggedIn: true });
  fireEvent.change(screen.getByPlaceholderText(T.legal_name_placeholder), { target: { value: 'Hoteli Bahari' } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: T.submit_button })); });
  expect(api.post).toHaveBeenCalledWith('/business/create', expect.objectContaining({ legalName: 'Hoteli Bahari' }));
  expect(onNavigate).toHaveBeenCalledWith('BusinessHome-42');
  expect(onNavigate).not.toHaveBeenCalledWith('BusinessDashboard');
});

test('someone with businesses picks one or opens another; never the old dashboard', async () => {
  const onNavigate = await open({ isLoggedIn: true }, [{ id: 7, legalName: 'Duka la Neema' }]);
  expect(screen.getByTestId('my-business-list')).toHaveTextContent('Duka la Neema');
  fireEvent.click(screen.getByText('Duka la Neema'));
  expect(onNavigate).toHaveBeenCalledWith('BusinessHome-7');
  fireEvent.click(screen.getByTestId('open-another-business'));
  expect(screen.getByPlaceholderText(T.legal_name_placeholder)).toBeInTheDocument();
});

test('what was typed before login comes back after it', async () => {
  const onNavigate = await open({ isLoggedIn: false });
  fireEvent.change(screen.getByPlaceholderText(T.legal_name_placeholder), { target: { value: 'Usafiri Express' } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: T.submit_button })); });
  expect(onNavigate).toHaveBeenCalledWith('PublicLogin');
  expect(localStorage.getItem('kentexa_after_login')).toBe('BecomeBusiness');
  cleanup();
  await open({ isLoggedIn: true }, [{ id: 7, legalName: 'Duka la Neema' }]);
  expect(screen.getByPlaceholderText(T.legal_name_placeholder)).toHaveValue('Usafiri Express');
  expect(localStorage.getItem('kentexa_business_draft')).toBeNull();
});
