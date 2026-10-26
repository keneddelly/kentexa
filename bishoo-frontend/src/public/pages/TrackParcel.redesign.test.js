import React from 'react';
import { render, screen, within } from '@testing-library/react';
import TrackParcel from './TrackParcel';
import api from '../../api/api';

jest.mock('react-i18next', () => {
  const texts = require('../../locales/sw.json');
  return { useTranslation: () => ({ t: (key, vars) => {
    const v = key.split('.').reduce((o, k) => (o ? o[k] : undefined), texts) ?? key;
    return String(v).replace(/\{\{(\w+)\}\}/g, (_m, k) => (vars && vars[k] != null ? vars[k] : ''));
  } }) };
});
jest.mock('../../api/api', () => ({ get: jest.fn() }));

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{23F3}\u{231B}]/u;
const hoursAgo = (h) => new Date(Date.now() - h * 3600000).toISOString();

test('in transit: real headline, milestones, newest event first, no guessed arrival, no emoji', async () => {
  api.get.mockResolvedValue({ data: {
    trackingNumber: 'KTX-DAR-MZA-000001', status: 'in_transit', originCity: 'Dar es Salaam', destinationCity: 'Mwanza',
    originAgent: 'Ofisi ya Kariakoo', destinationAgent: 'Ofisi ya Mwanza Mjini', busCompany: 'Shabiby', expectedArrival: null,
    history: [
      { status: 'parcel_run_loaded', city: null, createdAt: hoursAgo(2), source: 'custody' },
      { status: 'origin_hub_received', city: null, createdAt: hoursAgo(30), source: 'custody' },
    ],
  } });
  const { container } = render(<TrackParcel onNavigate={jest.fn()} trackingNumber="KTX-DAR-MZA-000001" />);
  expect(await screen.findByTestId('track-status')).toHaveTextContent('Uko safarini');
  expect(screen.getByTestId('milestone-3')).toHaveAttribute('aria-current', 'step');
  expect(screen.getByTestId('milestone-1')).toHaveTextContent('Umepokelewa ofisini');
  const items = within(screen.getByTestId('track-history')).getAllByRole('listitem');
  expect(items[0]).toHaveTextContent('Umepakiwa kwenye gari');      // newest first, readable
  expect(items[1]).toHaveTextContent('Umepokelewa ofisini');
  expect(container.textContent).not.toMatch(/Inatarajiwa/);          // no record date, no guess
  expect(container.textContent).not.toMatch(/origin_hub_received|parcel_run_loaded/);
  expect(screen.getByText('Shabiby')).toBeInTheDocument();
  expect(EMOJI.test(container.textContent)).toBe(false);
});

test('arrived at the office: the receiver is asked to choose pickup or delivery', async () => {
  api.get.mockResolvedValue({ data: { trackingNumber: 'KTX-1', status: 'awaiting_buyer', originCity: 'Arusha', destinationCity: 'Dar es Salaam',
    destinationAgent: 'Ofisi ya Ubungo', expectedArrival: '2026-10-29T08:00:00Z', history: [] } });
  render(<TrackParcel onNavigate={jest.fn()} trackingNumber="KTX-1" />);
  expect(await screen.findByText('Ungependa kuupokeaje?')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Nitachukua ofisini/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Niletewe nyumbani/ })).toBeInTheDocument();
});

test('signed in: my parcels are listed by my phone without typing a number', async () => {
  api.get.mockImplementation((url) => url === '/super-agents/shipments/buyer'
    ? Promise.resolve({ data: [{ trackingNumber: 'KTX-9', originCity: 'Dodoma', destinationCity: 'Dar es Salaam', status: 'delivered', senderName: 'Kisayo' }] })
    : Promise.reject(new Error('404')));
  render(<TrackParcel onNavigate={jest.fn()} isLoggedIn />);
  expect(await screen.findByText('Dodoma → Dar es Salaam')).toBeInTheDocument();
  expect(screen.getByText('Umepokelewa')).toBeInTheDocument();
});
