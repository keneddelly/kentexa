import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import TrackParcel from './TrackParcel';
import api from '../../api/api';
import sw from '../../locales/sw.json';

jest.mock('react-i18next', () => {
  const texts = require('../../locales/sw.json');
  return { useTranslation: () => ({ t: (key, vars) => {
    const v = key.split('.').reduce((o, k) => (o ? o[k] : undefined), texts) ?? key;
    return String(v).replace(/\{\{(\w+)\}\}/g, (_m, k) => (vars && vars[k] != null ? vars[k] : ''));
  } }) };
});
jest.mock('../../api/api', () => ({ get: jest.fn() }));

// The public order-ID route (/super-agents/track-order) was removed on
// purpose (13bd3eb); the page looks up the parcel's own number only.
const parcel = (n) => ({ trackingNumber: n, status: 'at_origin_hub', originCity: 'Dar es Salaam', destinationCity: 'Mbeya', tracking: [] });
const notFound = () => Promise.reject(Object.assign(new Error('404'), { response: { status: 404, data: { message: 'Not found' } } }));
const serve = ({ parcels = [], orders = [] }) => api.get.mockImplementation((url) => {
  const n = decodeURIComponent(url.split('/').pop());
  if (url.startsWith('/super-agents/track/') && parcels.includes(n)) return Promise.resolve({ data: parcel(n) });
  if (url.startsWith('/orders/by-tracking/') && orders.includes(n)) return Promise.resolve({ data: { id: 1, trackingNumber: n } });
  return notFound();
});

const search = async (value) => {
  fireEvent.change(screen.getByPlaceholderText(sw.track_parcel.search_placeholder), { target: { value } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: sw.track_parcel.track_button })); });
};
const calledUrls = () => api.get.mock.calls.map((c) => c[0]);

beforeEach(async () => {
  await act(async () => { render(<TrackParcel isLoggedIn={false} onNavigate={jest.fn()} />); });
});
afterEach(() => expect(calledUrls().some((u) => u.includes('track-order'))).toBe(false));

test('a plain order number finds the parcel that carries KTX-ORD-n', async () => {
  serve({ parcels: ['KTX-ORD-47'] });
  await search('47');
  expect(calledUrls()).toContain('/super-agents/track/KTX-ORD-47');
  expect(screen.queryByText(/haikupatikana/)).toBeNull();
});

test('an order not handed to an office yet: says so instead of an error', async () => {
  serve({ orders: ['KTX-ORD-48'] });
  await search('KTX-ORD-48');
  expect(screen.getByTestId('track-notice')).toHaveTextContent('KTX-ORD-48');
});

test('an unknown order number: not found', async () => {
  serve({});
  await search('49');
  expect(screen.getByText(/KTX-ORD-49" haikupatikana/)).toBeInTheDocument();
});

test('batch and offline numbers are the parcel\'s own number', async () => {
  serve({ parcels: ['KTX-BATCH-3-50'] });
  await search('ktx-batch-3-50');
  expect(calledUrls()).toEqual(['/super-agents/track/KTX-BATCH-3-50']);
});
