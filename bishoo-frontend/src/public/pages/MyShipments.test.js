import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MyShipments from './MyShipments';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ get: jest.fn() }));
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
