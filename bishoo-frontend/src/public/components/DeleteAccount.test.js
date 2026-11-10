import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import api from '../../api/api';
import DeleteAccount from './DeleteAccount';

jest.mock('../../api/api', () => ({ __esModule: true, default: { post: jest.fn() } }));

beforeEach(() => { jest.useFakeTimers(); api.post.mockReset(); });
afterEach(() => { jest.useRealTimers(); });

test('a code to the account phone, then the account is deleted and the person signed out', async () => {
  const onDeleted = jest.fn();
  api.post.mockImplementation(async (url) => (url === '/auth/delete-account/request' ? { data: { to: '255****678' } } : { data: { deleted: true } }));
  render(<DeleteAccount onDeleted={onDeleted} />);
  fireEvent.click(screen.getByTestId('delete-account-open'));
  await act(async () => { fireEvent.click(screen.getByTestId('delete-account-send')); });
  expect(api.post).toHaveBeenCalledWith('/auth/delete-account/request');
  expect(screen.getByText(/kwa 255\*\*\*\*678/)).toBeInTheDocument();
  fireEvent.change(screen.getByTestId('delete-account-code'), { target: { value: '123456' } });
  await act(async () => { fireEvent.click(screen.getByTestId('delete-account-confirm')); });
  expect(api.post).toHaveBeenCalledWith('/auth/delete-account/confirm', { code: '123456' });
  expect(screen.getByRole('status')).toHaveTextContent('Akaunti yako imefutwa');
  act(() => { jest.advanceTimersByTime(1600); });
  expect(onDeleted).toHaveBeenCalled();
});

test('open orders: the server reason is shown and nothing is deleted', async () => {
  api.post.mockRejectedValue({ response: { data: { message: 'Una oda 2 ambazo bado hazijaisha.' } } });
  render(<DeleteAccount onDeleted={jest.fn()} />);
  fireEvent.click(screen.getByTestId('delete-account-open'));
  await act(async () => { fireEvent.click(screen.getByTestId('delete-account-send')); });
  expect(screen.getByRole('alert')).toHaveTextContent('Una oda 2');
  expect(screen.queryByTestId('delete-account-code')).toBeNull();
});
