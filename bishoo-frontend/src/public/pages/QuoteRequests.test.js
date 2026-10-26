import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import api from '../../api/api';
import QuoteRequest from './QuoteRequest';
import MyQuoteRequests from './MyQuoteRequests';
import QuoteInbox from './QuoteInbox';

jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), put: jest.fn() } }));
jest.mock('../components/BackBar', () => () => null);

beforeEach(() => { api.get.mockReset(); api.post.mockReset(); });

test('Omba bei: hire a whole vehicle, then go to my requests', async () => {
  api.get.mockResolvedValue({ data: [{ name: 'Dar es Salaam' }, { name: 'Mwanza' }] });
  api.post.mockResolvedValue({ data: { id: 7, status: 'open' } });
  const onNavigate = jest.fn();
  render(<QuoteRequest onNavigate={onNavigate} currentUser={{ phone: '255712345678' }} />);
  await screen.findAllByRole('option', { name: 'Mwanza' });
  expect(screen.getByTestId('quote-send')).toBeDisabled();
  fireEvent.click(screen.getByText('Fuso / Lori'));
  fireEvent.change(screen.getByLabelText('Unatoka wapi?'), { target: { value: 'Dar es Salaam' } });
  fireEvent.change(screen.getByLabelText('Unakwenda wapi?'), { target: { value: 'Mwanza' } });
  fireEvent.change(screen.getByLabelText('Mzigo ni nini?'), { target: { value: 'Kuhama nyumba' } });
  expect(screen.getByLabelText('Simu yako')).toHaveValue('0712345678');
  fireEvent.click(screen.getByTestId('quote-send'));
  await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('MyQuoteRequests'));
  expect(api.post).toHaveBeenCalledWith('/quote-requests', expect.objectContaining({
    kind: 'vehicle', vehicleType: 'fuso', fromCity: 'Dar es Salaam', toCity: 'Mwanza', description: 'Kuhama nyumba', phone: '0712345678',
  }));
});

test('my requests: prices cheapest first, choose one', async () => {
  api.get.mockResolvedValue({ data: [{ id: 3, kind: 'goods', goodsType: 'container', status: 'open', fromCity: 'Dar es Salaam', toCity: 'Arusha',
    fromText: 'Dar es Salaam', toText: 'Arusha', description: 'Kontena futi 20', offers: [
      { id: 11, responderName: 'Samatta', price: 900000, status: 'offered' },
      { id: 12, responderName: 'Mtandao', price: 950000, status: 'offered' },
    ] }] });
  api.post.mockResolvedValue({ data: {} });
  render(<MyQuoteRequests onNavigate={jest.fn()} />);
  expect(await screen.findByText('TZS 900,000')).toBeInTheDocument();
  expect(screen.getByText('Kontena')).toBeInTheDocument();
  fireEvent.click(screen.getAllByText('Chagua')[0]);
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/quote-requests/3/accept/11'));
});

test('inbox: an office gives its price', async () => {
  api.get.mockResolvedValue({ data: { responder: { type: 'office', name: 'Geita Express' }, requests: [
    { id: 5, kind: 'goods', goodsType: 'large', status: 'open', fromCity: 'Geita', toCity: 'Mwanza', fromText: 'Geita', toText: 'Mwanza',
      description: 'Magunia 40 ya mchele', phone: null, myOffer: null },
  ] } });
  api.post.mockResolvedValue({ data: { id: 1 } });
  render(<QuoteInbox onNavigate={jest.fn()} />);
  fireEvent.change(await screen.findByLabelText('Bei yako (TZS)'), { target: { value: '120,000' } });
  fireEvent.click(screen.getByText('Tuma bei'));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/quote-requests/5/offer', { price: 120000, note: undefined }));
});

test('accepted trip: the waybill shows and opens tracking; the transporter moves it on', async () => {
  api.get.mockResolvedValueOnce({ data: [{ id: 4, kind: 'vehicle', vehicleType: 'fuso', status: 'accepted', fromCity: 'Dar es Salaam', toCity: 'Dodoma',
    fromText: 'Dar es Salaam', toText: 'Dodoma', description: 'Kuhama', trip: { waybill: 'KX 1234 5678 90', trackRef: 'KX1234567890', status: 'pending' },
    offers: [{ id: 20, responderName: 'Mtandao', price: 700000, status: 'accepted', phone: '255700000001' }] }] });
  const onNavigate = jest.fn();
  render(<MyQuoteRequests onNavigate={onNavigate} />);
  fireEvent.click(await screen.findByTestId('trip-waybill'));
  expect(onNavigate).toHaveBeenCalledWith('TrackParcel-KX1234567890');
});

test('inbox: the chosen transporter marks the trip on the way', async () => {
  api.get.mockResolvedValue({ data: { responder: { type: 'transport', name: 'Mtandao' }, requests: [
    { id: 4, kind: 'vehicle', vehicleType: 'fuso', status: 'accepted', fromCity: 'Dar es Salaam', toCity: 'Dodoma', fromText: 'Dar es Salaam', toText: 'Dodoma',
      description: 'Kuhama', phone: '255712345678', myOffer: { id: 20, price: 700000, status: 'accepted' },
      trip: { waybill: 'KX 1234 5678 90', trackRef: 'KX1234567890', status: 'pending' } },
  ] } });
  api.post.mockResolvedValue({ data: {} });
  render(<QuoteInbox onNavigate={jest.fn()} />);
  fireEvent.click(await screen.findByText('Mzigo uko njiani'));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/quote-requests/4/trip', { step: 'in_transit' }));
});
