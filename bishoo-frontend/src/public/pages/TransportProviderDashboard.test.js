import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import api from '../../api/api';
import TransportProviderDashboard from './TransportProviderDashboard';

jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), patch: jest.fn() } }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k) => k }) }));
jest.mock('../components/BackBar', () => () => null);
jest.mock('../components/RunBookings', () => () => null);
jest.mock('../components/RoutesAwaitingPrice', () => () => null);

const office = { name: 'Samatta', storeName: 'Samatta Cargo', phone: '0712000000' };
const assignments = [
  { id: 1, status: 'pending', fromCity: 'Dar es Salaam', toCity: 'Mwanza', parcelCount: 3, weightKg: 40, assignedBy: office },
  { id: 2, status: 'accepted', fromCity: 'Dar es Salaam', toCity: 'Arusha', parcelCount: 2, weightKg: 10, agreedPrice: 20000, scheduledDeparture: '18:00', assignedBy: office },
  { id: 3, status: 'accepted', fromCity: 'Dar es Salaam', toCity: 'Arusha', parcelCount: 1, weightKg: 5, agreedPrice: 10000, scheduledDeparture: '18:00', assignedBy: office },
  { id: 4, status: 'completed', fromCity: 'Dar es Salaam', toCity: 'Dodoma', agreedPrice: 50000, completedAt: new Date().toISOString(), assignedBy: office },
];

beforeEach(() => {
  api.get.mockReset(); api.patch.mockReset();
  api.get.mockImplementation(async (url) => {
    if (url === '/transport/my-profile') return { data: { id: 9, name: 'Mtandao Transport', type: 'truck', status: 'verified' } };
    if (url === '/transport/assignments') return { data: assignments };
    if (url === '/quote-requests/inbox') return { data: { requests: [{ id: 7, status: 'open', fromCity: 'Dar es Salaam', toCity: 'Dodoma', description: 'Kuhama', myOffer: null }] } };
    return { data: [] };
  });
  api.patch.mockResolvedValue({ data: {} });
});

test('home: two jobs - KAZI counts office loads and vehicle requests; SAFARI counts trips', async () => {
  render(<TransportProviderDashboard onNavigate={jest.fn()} />);
  const kazi = await screen.findByTestId('transport-kazi');
  await waitFor(() => expect(within(kazi).getByText('2')).toBeInTheDocument());   // 1 office load + 1 vehicle request
  expect(within(screen.getByTestId('transport-safari')).getByText('1')).toBeInTheDocument(); // two assignments, one trip
  expect(screen.getByTestId('transport-month')).toHaveTextContent('TZS 50,000');
});

test('KAZI: accept a load from an office', async () => {
  render(<TransportProviderDashboard onNavigate={jest.fn()} />);
  fireEvent.click(await screen.findByTestId('transport-kazi'));
  fireEvent.click(screen.getByText('Kubali'));
  await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/transport/assignments/1/respond', { accept: true, declineReason: null }));
});

test('SAFARI: one tap moves the whole load of a trip', async () => {
  render(<TransportProviderDashboard onNavigate={jest.fn()} />);
  fireEvent.click(await screen.findByTestId('transport-safari'));
  const trip = screen.getByTestId('transport-trip');
  expect(trip).toHaveTextContent('Mizigo 3');
  fireEvent.click(within(trip).getByText('Nimepakia mzigo'));
  await waitFor(() => expect(api.patch).toHaveBeenCalledTimes(2));
  expect(api.patch).toHaveBeenCalledWith('/transport/assignments/2/status', { status: 'collected', proofUrl: null });
  expect(api.patch).toHaveBeenCalledWith('/transport/assignments/3/status', { status: 'collected', proofUrl: null });
});
