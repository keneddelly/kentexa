import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import StaleParcelsNotice from './StaleParcelsNotice';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));

const hoursAgo = (h) => new Date(Date.now() - h * 3600000).toISOString();
const list = (parcels) => ({ data: { staleHours: 6, count: parcels.length, parcels } });
const A = { parcelId: 1, waybillNumber: 'KTX9749234226', trackingNumber: 'KTX-ORD-9', recipientName: 'Fatma F', destinationCity: 'Mwanza', receivedAt: hoursAgo(50), bulkShipmentCode: null };
const B = { parcelId: 2, waybillNumber: null, trackingNumber: 'KTX-ORD-7', recipientName: null, destinationCity: 'Arusha', receivedAt: hoursAgo(8), bulkShipmentCode: 'BULK-DAR-MZA-1' };

afterEach(() => jest.clearAllMocks());

test('shows the red number and, when tapped, the list (waybill, recipient, destination, age)', async () => {
  api.get.mockResolvedValue(list([A, B]));
  render(<StaleParcelsNotice onAddToShehena={() => {}} />);
  const banner = await screen.findByText(/bila taarifa za kusafirisha \(zaidi ya saa 6\)/);
  expect(screen.getByText('2')).toBeInTheDocument();
  fireEvent.click(banner);
  expect(screen.getByText('KTX 9749 2342 26')).toBeInTheDocument();       // waybill, grouped
  expect(screen.getByText('KTX-ORD-7')).toBeInTheDocument();              // old parcel: old number
  expect(screen.getByText(/Fatma F · Mwanza · kimepokelewa siku 2 zilizopita/)).toBeInTheDocument();
  expect(screen.getByText(/Mpokeaji hajaandikwa · Arusha · kimepokelewa saa 8 zilizopita/)).toBeInTheDocument();
  expect(screen.getByText(/Kiko kwenye shehena BULK-DAR-MZA-1/)).toBeInTheDocument();
});

test('"Add to shehena" hands the parcel to the existing shehena flow', async () => {
  api.get.mockResolvedValue(list([A]));
  const onAdd = jest.fn();
  render(<StaleParcelsNotice onAddToShehena={onAdd} />);
  fireEvent.click(await screen.findByText(/bila taarifa za kusafirisha/));
  fireEvent.click(screen.getByText('📦 Ongeza kwenye shehena'));
  expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ parcelId: 1 }));
});

test('"Still here" is one tap, then the list reloads (empty list = no red notice)', async () => {
  api.get.mockResolvedValueOnce(list([A])).mockResolvedValueOnce(list([]));
  api.post.mockResolvedValue({ data: { parcelId: 1 } });
  const { container } = render(<StaleParcelsNotice onAddToShehena={() => {}} />);
  fireEvent.click(await screen.findByText(/bila taarifa za kusafirisha/));
  fireEvent.click(screen.getByText('✋ Bado kiko hapa'));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/dispatch-reminders/parcels/1/still-here'));
  await waitFor(() => expect(container).toBeEmptyDOMElement());
});

test('shows nothing when the list is empty or the server fails (never blocks the counter)', async () => {
  api.get.mockResolvedValueOnce(list([]));
  const first = render(<StaleParcelsNotice />);
  await waitFor(() => expect(api.get).toHaveBeenCalled());
  expect(first.container).toBeEmptyDOMElement();
  first.unmount();
  api.get.mockRejectedValueOnce(new Error('server down'));
  const second = render(<StaleParcelsNotice />);
  await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
  expect(second.container).toBeEmptyDOMElement();
});
