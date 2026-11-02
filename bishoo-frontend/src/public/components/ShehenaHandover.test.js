import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ShehenaConfirm, ShehenaIncoming, ShehenaSent } from './ShehenaHandover';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ get: jest.fn(), post: jest.fn() }));
beforeEach(() => { api.get.mockReset(); api.post.mockReset(); });

const incoming = { id: 9, originCity: 'Dar es Salaam', fromOffice: 'Samatta Cargo', totalParcels: 14, transportCompany: 'Kilimanjaro Cargo', dispatchTime: '2026-11-02T10:00:00Z' };

test('receiving office: the shehena code receives all its parcels at once (owner approved 2026-11-02)', async () => {
  api.get.mockResolvedValue({ data: [incoming] });
  api.post.mockResolvedValue({ data: { received: 14, skipped: [] } });
  const onReceived = jest.fn();
  await act(async () => { render(<ShehenaIncoming onReceived={onReceived} />); });
  expect(api.get).toHaveBeenCalledWith('/super-agents/shehena/incoming');
  fireEvent.click(screen.getByTestId('shehena-open-9'));
  expect(screen.getByTestId('shehena-receive')).toBeDisabled();
  fireEvent.change(screen.getByTestId('shehena-code'), { target: { value: '48 29a13' } });
  expect(screen.getByTestId('shehena-code')).toHaveValue('482913');
  await act(async () => { fireEvent.click(screen.getByTestId('shehena-receive')); });
  expect(api.post).toHaveBeenCalledWith('/super-agents/shehena/9/receive', { code: '482913' });
  expect(onReceived).toHaveBeenCalled();
  expect(screen.getByRole('status')).toHaveTextContent('vifurushi 14 vimepokelewa');
});

test('no code (lost label): receive with a reason; a wrong code shows the server message', async () => {
  api.get.mockResolvedValue({ data: [incoming] });
  api.post.mockRejectedValueOnce({ response: { data: { message: 'Namba ya shehena si sahihi.' } } });
  await act(async () => { render(<ShehenaIncoming />); });
  fireEvent.click(screen.getByTestId('shehena-open-9'));
  fireEvent.change(screen.getByTestId('shehena-code'), { target: { value: '111111' } });
  await act(async () => { fireEvent.click(screen.getByTestId('shehena-receive')); });
  expect(screen.getByRole('alert')).toHaveTextContent('Namba ya shehena si sahihi.');
  fireEvent.click(screen.getByText('Sina namba'));
  fireEvent.change(screen.getByTestId('shehena-reason'), { target: { value: 'Lebo imepotea' } });
  api.post.mockResolvedValueOnce({ data: { received: 14, skipped: [] } });
  await act(async () => { fireEvent.click(screen.getByTestId('shehena-receive')); });
  expect(api.post).toHaveBeenLastCalledWith('/super-agents/shehena/9/receive', { reason: 'Lebo imepotea' });
});

test('sending office sees the code of each shehena on the way; nothing when none', async () => {
  api.get.mockResolvedValue({ data: [
    { id: 9, destinationCity: 'Mwanza', totalParcels: 14, handoverCode: '482913', status: 'dispatched', transportCompany: 'Kilimanjaro Cargo' },
    { id: 8, destinationCity: 'Arusha', totalParcels: 3, handoverCode: '111222', status: 'arrived' },
  ] });
  await act(async () => { render(<ShehenaSent />); });
  expect(screen.getByTestId('shehena-sent-9')).toHaveTextContent('482913');
  expect(screen.queryByTestId('shehena-sent-8')).toBeNull();
});

test('transporter confirms with the code', async () => {
  api.post.mockResolvedValue({ data: { confirmedAt: '2026-11-02T18:00:00Z' } });
  const onConfirmed = jest.fn();
  render(<ShehenaConfirm shehena={{ id: 9, status: 'dispatched' }} onConfirmed={onConfirmed} />);
  fireEvent.change(screen.getByTestId('transport-code-9'), { target: { value: '482913' } });
  await act(async () => { fireEvent.click(screen.getByTestId('transport-confirm-9')); });
  expect(api.post).toHaveBeenCalledWith('/super-agents/shehena/as-transport/9/confirm', { code: '482913' });
  expect(onConfirmed).toHaveBeenCalledWith(9, '2026-11-02T18:00:00Z');
});
