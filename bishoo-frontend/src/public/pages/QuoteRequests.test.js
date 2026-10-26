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
