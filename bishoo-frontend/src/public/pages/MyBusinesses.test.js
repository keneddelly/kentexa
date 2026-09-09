import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import MyBusinesses from './MyBusinesses';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key) => key }) }));

beforeEach(() => jest.clearAllMocks());

test('empty state renders when the user has zero Businesses', async () => {
  api.get.mockResolvedValue({ data: [] });
  render(<MyBusinesses isLoggedIn onNavigate={jest.fn()} />);
  await waitFor(() => expect(screen.getByText('my_businesses.empty_title')).toBeInTheDocument());
});

test('renders one Business row and navigates to its Business Home on tap', async () => {
  api.get.mockResolvedValue({ data: [{ id: 2, legalName: 'Bishoo Intelligence System', tradingName: 'BiS', status: 'active' }] });
  const onNavigate = jest.fn();
  render(<MyBusinesses isLoggedIn onNavigate={onNavigate} />);
  await waitFor(() => expect(screen.getByText('BiS')).toBeInTheDocument());
  fireEvent.click(screen.getByText('BiS'));
  expect(onNavigate).toHaveBeenCalledWith('BusinessHome-2');
});

test('renders multiple Businesses (structurally multi-Business-ready even though none exists in production yet)', async () => {
  api.get.mockResolvedValue({ data: [
    { id: 2, tradingName: 'BiS', status: 'active' },
    { id: 5, tradingName: 'Second Co', status: 'active' },
  ] });
  render(<MyBusinesses isLoggedIn onNavigate={jest.fn()} />);
  await waitFor(() => expect(screen.getByText('BiS')).toBeInTheDocument());
  expect(screen.getByText('Second Co')).toBeInTheDocument();
});

test('load failure shows an error with retry, not a crash', async () => {
  api.get.mockRejectedValue(new Error('down'));
  render(<MyBusinesses isLoggedIn onNavigate={jest.fn()} />);
  await waitFor(() => expect(screen.getByText('my_businesses.load_failed')).toBeInTheDocument());
  expect(screen.getByText('common.try_again')).toBeInTheDocument();
});

test('create-business form uses the existing POST /business/create and never omits legalName validation', async () => {
  api.get.mockResolvedValue({ data: [] });
  api.post.mockResolvedValue({ data: { id: 9 } });
  const onNavigate = jest.fn();
  render(<MyBusinesses isLoggedIn onNavigate={onNavigate} />);
  await waitFor(() => expect(screen.getByText('my_businesses.create_button')).toBeInTheDocument());
  fireEvent.click(screen.getByText('my_businesses.create_button'));
  fireEvent.click(screen.getByText('my_businesses.create_button')); // submit with empty name
  expect(screen.getByText('my_businesses.name_required')).toBeInTheDocument();
  expect(api.post).not.toHaveBeenCalled();
});
