import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MyShipments from './MyShipments';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ get: jest.fn(), post: jest.fn() }));
jest.mock('../components/ShipmentPickupPanel', () => () => null);

beforeEach(() => jest.clearAllMocks());

test('lists authenticated sender shipments from the canonical endpoint and opens tracking', async () => {
  api.get.mockResolvedValue({ data: [{ id: 3, trackingNumber: 'KTX-SHP-123', itemDescription: 'Vitabu', originCity: 'Dar', destinationCity: 'Mwanza', status: 'pending' }] });
  const onNavigate = jest.fn();
  render(<MyShipments onNavigate={onNavigate} />);
  expect(api.get).toHaveBeenCalledWith('/shipments/mine');
  expect(await screen.findByText('Vitabu')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Vitabu'));
  expect(onNavigate).toHaveBeenCalledWith('TrackParcel-KTX-SHP-123');
});

test('shows a real error instead of falsely saying no shipments', async () => {
  api.get.mockRejectedValueOnce(new Error('Network unavailable')).mockResolvedValueOnce({ data: [] });
  render(<MyShipments onNavigate={jest.fn()} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Network unavailable');
  fireEvent.click(screen.getByText('Jaribu tena'));
  expect(await screen.findByText('Bado hujatuma mzigo kupitia Kentexa.')).toBeInTheDocument();
  expect(api.get).toHaveBeenCalledTimes(2);
});

test('rejects malformed API responses rather than silently showing an empty list', async () => {
  api.get.mockResolvedValue({ data: { unexpected: true } });
  render(<MyShipments onNavigate={jest.fn()} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Majibu ya mizigo si sahihi');
});

test('does not open an invalid tracking reference', async () => {
  api.get.mockResolvedValue({ data: [{ id: 5, itemDescription: 'Mzigo', status: 'pending' }] });
  const onNavigate = jest.fn();
  render(<MyShipments onNavigate={onNavigate} />);
  fireEvent.click(await screen.findByText('Mzigo'));
  expect(onNavigate).not.toHaveBeenCalled();
});

test('keyboard opens tracking only from the shipment card, not nested actions', async () => {
  api.get.mockResolvedValue({ data: [{ id: 7, trackingNumber: 'KTX-SHP-777', itemDescription: 'Sanduku', originCity: 'Dar', destinationCity: 'Mwanza', status: 'pending' }] });
  const onNavigate = jest.fn();
  render(<MyShipments onNavigate={onNavigate} />);
  const card = (await screen.findByText('Sanduku')).closest('[role="button"]');
  fireEvent.keyDown(card, { key: ' ', code: 'Space' });
  expect(onNavigate).toHaveBeenCalledWith('TrackParcel-KTX-SHP-777');
  onNavigate.mockClear();
  const nested = document.createElement('button');
  card.appendChild(nested);
  fireEvent.keyDown(nested, { key: 'Enter', code: 'Enter' });
  expect(onNavigate).not.toHaveBeenCalled();
});

test('shows missing tracking number without advertising a broken tracking action', async () => {
  api.get.mockResolvedValue({ data: [{ id: 8, itemDescription: 'Mfuko', status: 'pending' }] });
  render(<MyShipments onNavigate={jest.fn()} />);
  const card = (await screen.findByText('Mfuko')).parentElement.parentElement;
  expect(screen.getByText('Inasubiri namba ya ufuatiliaji')).toBeInTheDocument();
  expect(card).not.toHaveAttribute('role', 'button');
});

test('claims a desk shipment by the number on the receipt, only after SMS verification', async () => {
  api.get.mockResolvedValue({ data: [] });
  api.post.mockResolvedValueOnce({ data: { sent: true } })
    .mockResolvedValueOnce({ data: { shipmentId: 123 } });
  render(<MyShipments onNavigate={jest.fn()} />);
  fireEvent.click(screen.getByText('Ongeza mzigo wa dawati'));
  fireEvent.change(screen.getByPlaceholderText('Mfano: KTX 1674 9680 01'), { target: { value: ' KTX 1674 9680 01 ' } });
  const secret = 'a3f29c01'.repeat(4) + 'beef';
  const printed = secret.match(/.{1,4}/g).join(' ');
  fireEvent.change(screen.getByPlaceholderText('Andika kama ilivyochapishwa, mfano a3f2 9c01 …'), { target: { value: printed } });
  fireEvent.click(screen.getByText('Tuma SMS ya uthibitisho'));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/shipments/claim-by-number/start',
    { reference: 'KTX 1674 9680 01', receiptSecret: secret }));
  fireEvent.change(await screen.findByPlaceholderText('Namba 6 za SMS'), { target: { value: '012345' } });
  fireEvent.click(screen.getByText('Thibitisha na ongeza mzigo'));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/shipments/claim-by-number',
    { reference: 'KTX 1674 9680 01', receiptSecret: secret, otp: '012345' }));
  await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
});

test('does not request OTP without the parcel number', async () => {
  api.get.mockResolvedValue({ data: [] });
  render(<MyShipments onNavigate={jest.fn()} />);
  fireEvent.click(screen.getByText('Ongeza mzigo wa dawati'));
  fireEvent.change(screen.getByPlaceholderText('Mfano: KTX 1674 9680 01'), { target: { value: '   ' } });
  fireEvent.change(screen.getByPlaceholderText('Andika kama ilivyochapishwa, mfano a3f2 9c01 …'), { target: { value: 'a'.repeat(36) } });
  fireEvent.click(screen.getByText('Tuma SMS ya uthibitisho'));
  expect(await screen.findByRole('alert')).toHaveTextContent('Weka Namba ya Mzigo');
  expect(api.post).not.toHaveBeenCalled();
});