import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import PosCashierSwitch from './PosCashierSwitch';
import api from '../../api/api';
import { pinMatches } from '../../utils/posCashier';

jest.mock('../../api/api', () => ({ __esModule: true, default: { post: jest.fn() } }));
jest.mock('../../utils/posCashier', () => ({ pinMatches: jest.fn() }));

const cashiers = [
  { userId: 1, name: 'Asha', owner: true, hasPin: true, salt: 'a', pinHash: 'h' },
  { userId: 2, name: 'Juma', owner: false, hasPin: false },
];

test('Badilisha mhudumu: the cashier picks their name and types the PIN, also offline (owner approved 2026-11-03)', async () => {
  pinMatches.mockResolvedValue(true);
  const onPick = jest.fn();
  render(<PosCashierSwitch cashiers={cashiers} online={false} onPick={onPick} onClose={jest.fn()} />);
  expect(screen.getByTestId('cashier-2')).toBeDisabled(); // no PIN yet and no internet
  fireEvent.click(screen.getByTestId('cashier-1'));
  for (const d of ['1', '2', '3', '4']) await act(async () => { fireEvent.click(screen.getByTestId(`pin-${d}`)); });
  expect(pinMatches).toHaveBeenCalledWith(cashiers[0], '1234');
  expect(onPick).toHaveBeenCalledWith({ userId: 1, name: 'Asha' });
});

test('a wrong PIN is refused; a cashier without a PIN sets one online', async () => {
  pinMatches.mockResolvedValue(false);
  api.post.mockResolvedValue({ data: { hasPin: true } });
  const onPick = jest.fn();
  render(<PosCashierSwitch cashiers={cashiers} online onPick={onPick} onClose={jest.fn()} onPinSet={jest.fn()} openShiftWarning current={{ userId: 1, name: 'Asha' }} onCloseShiftFirst={jest.fn()} />);
  expect(screen.getByText(/Zamu ya Asha bado iko wazi/)).toBeInTheDocument();
  fireEvent.click(screen.getByTestId('cashier-1'));
  for (const d of ['9', '9', '9', '9']) await act(async () => { fireEvent.click(screen.getByTestId(`pin-${d}`)); });
  expect(screen.getByRole('alert')).toHaveTextContent('PIN si sahihi.');
  expect(onPick).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Rudi'));
  fireEvent.click(screen.getByTestId('cashier-2'));
  for (const d of ['4', '3', '2', '1']) await act(async () => { fireEvent.click(screen.getByTestId(`pin-${d}`)); });
  expect(api.post).toHaveBeenCalledWith('/sales/pos/cashiers/2/pin', { pin: '4321' });
  expect(onPick).toHaveBeenCalledWith({ userId: 2, name: 'Juma' });
});
