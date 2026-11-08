import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PickupLive, { minutesSince, timeLeft } from './PickupLive';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
beforeEach(() => jest.clearAllMocks());

test('waiting: the nearby agents with km and Piga; "Waambie tena" (owner 2026-11-08, like Bolt)', async () => {
  api.get.mockResolvedValue({ data: { office: null, task: { status: 'requested', requestedAt: new Date().toISOString(),
    nearby: [{ id: 3, name: 'Amimu', phone: '0712 345 678', distanceKm: 1.2, isOnline: true }, { id: 4, name: 'Kened', phone: '0755', distanceKm: null }] } } });
  api.post.mockResolvedValue({ data: { told: 2 } });
  render(<PickupLive shipmentId={9} />);
  expect(await screen.findByTestId('live-agent-3')).toHaveTextContent('km 1.2 kutoka dukani');
  expect(screen.getByTestId('live-agent-4')).toHaveTextContent('hajaweka kituo');
  expect(screen.getAllByText('Piga')[0].closest('a')).toHaveAttribute('href', 'tel:0712345678');
  fireEvent.click(screen.getByTestId('live-remind'));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/shipments/9/pickup-task/remind'));
  expect(await screen.findByText('Mawakala 2 wameambiwa tena.')).toBeInTheDocument();
});

test('no agent near: says so clearly, with the office to bring it to (intercity too)', async () => {
  api.get.mockResolvedValue({ data: { task: { status: 'requested', requestedAt: new Date().toISOString(), nearby: [] },
    office: { id: 7, name: 'Arusha Matta', phone: '0744', address: 'Kariakoo', distanceKm: 2.5, mapsUrl: 'https://maps', received: false } } });
  render(<PickupLive shipmentId={9} />);
  expect(await screen.findByText('Hakuna wakala karibu sasa hivi')).toBeInTheDocument();
  expect(screen.getByTestId('live-office')).toHaveTextContent('Ofisi bado haijapokea');
});

test('accepted: who is coming, with Piga; an office drop-off with no agent shows the office only', async () => {
  api.get.mockResolvedValueOnce({ data: { office: null, task: { status: 'claimed', agent: { name: 'Amimu', phone: '0712', distanceKm: 0.8 } } } });
  const { unmount } = render(<PickupLive shipmentId={9} />);
  expect(await screen.findByTestId('live-accepted')).toHaveTextContent('Amimu amekubali, anakuja kuchukua');
  unmount();
  api.get.mockResolvedValueOnce({ data: { task: null, office: { id: 7, name: 'Ofisi X', phone: null, received: true } } });
  render(<PickupLive shipmentId={10} />);
  expect(await screen.findByTestId('live-office')).toHaveTextContent('Ofisi imepokea mzigo');
  expect(minutesSince(new Date(Date.now() - 5 * 60000).toISOString())).toBe(5);
});

// Owner 2026-11-09: offered for 5 minutes, then gone from the agents' lists; the sender decides.
test('the offer has a countdown; when it ends: "Hakuna aliyekubali", Piga and Waambie tena start a new window', async () => {
  const ago = new Date(Date.now() - 6 * 60000).toISOString();
  api.get.mockResolvedValue({ data: { office: null, task: { status: 'requested', requestedAt: ago, offerEndsAt: new Date(Date.now() - 60000).toISOString(),
    nearby: [{ id: 3, name: 'Amimu', phone: '0712', distanceKm: 1.2 }] } } });
  api.post.mockResolvedValue({ data: { told: 1, offerEndsAt: new Date(Date.now() + 5 * 60000).toISOString() } });
  render(<PickupLive shipmentId={9} pollMs={60000} />);
  expect(await screen.findByText('Hakuna aliyekubali')).toBeInTheDocument();
  expect(screen.getByText(/Kazi imeondolewa kwa mawakala/)).toBeInTheDocument();
  expect(screen.queryByTestId('live-countdown')).toBeNull();
  expect(screen.getByTestId('live-agent-3')).toBeInTheDocument();
  fireEvent.click(screen.getByTestId('live-remind'));
  expect(await screen.findByTestId('live-countdown')).toHaveTextContent(/Muda wa kukubali: [45]:\d\d/);
  expect(screen.queryByText('Hakuna aliyekubali')).toBeNull();
});

test('timeLeft', () => {
  const now = Date.parse('2026-11-09T10:00:00Z');
  expect(timeLeft('2026-11-09T10:04:05Z', now)).toBe('4:05');
  expect(timeLeft('2026-11-09T09:59:00Z', now)).toBeNull();
  expect(timeLeft(null, now)).toBeNull();
});
