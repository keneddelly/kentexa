import React from 'react';
import { act, render, screen } from '@testing-library/react';
import api from '../../api/api';
import ShareResult from './ShareResult';
import ViralGrowthCard from '../../admin/components/ViralGrowthCard';

jest.mock('../../api/api', () => ({ get: jest.fn() }));

test('B9: the sharer sees what their shares brought; only when they shared', async () => {
  api.get.mockResolvedValueOnce({ data: { shared: true, opens: 23, joined: 3, newReplies: 5, channels: [{ channel: 'whatsapp', opens: 17 }, { channel: 'facebook', opens: 4 }] } });
  await act(async () => { render(<ShareResult contentType="post" contentId={88} isLoggedIn />); });
  expect(api.get).toHaveBeenCalledWith('/share-links/mine/post/88');
  expect(screen.getByTestId('share-result-opens')).toHaveTextContent('23');
  expect(screen.getByTestId('share-result-joined')).toHaveTextContent('3');
  expect(screen.getByTestId('share-result-replies')).toHaveTextContent('5');
  expect(screen.getByTestId('share-result-channels')).toHaveTextContent('WhatsApp 17 · Facebook 4');
});

test('B9: not shared, or a guest: nothing', async () => {
  api.get.mockResolvedValueOnce({ data: { shared: false } });
  const { container } = render(<ShareResult contentType="post" contentId={88} isLoggedIn />);
  await act(async () => {});
  expect(container).toBeEmptyDOMElement();
  api.get.mockClear();
  render(<ShareResult contentType="post" contentId={88} isLoggedIn={false} />);
  expect(api.get).not.toHaveBeenCalled();
});

test('E: the admin report shows recorded numbers by channel', async () => {
  api.get.mockResolvedValueOnce({ data: {
    days: 30, totals: { links: 40, sharers: 10, opens: 200, guestOpens: 150, joined: 15, firstParticipation7d: 9, resharingNewMembers: 3, resharedLinks: 6 },
    rates: { openToJoinPct: 10, joinToParticipatePct: 60, newMembersPerSharer: 1.5 },
    byChannel: [{ channel: 'status', links: 12, opens: 90, joined: 7 }], byType: [], topContent: [], topCommunities: [],
  } });
  await act(async () => { render(<ViralGrowthCard />); });
  expect(api.get).toHaveBeenCalledWith('/share-links/admin/report', { params: { days: 30 } });
  expect(screen.getByTestId('viral-growth-card')).toHaveTextContent('Mgeni → kujiunga: 10%');
  expect(screen.getByTestId('viral-by-channel')).toHaveTextContent('WhatsApp Status');
});
