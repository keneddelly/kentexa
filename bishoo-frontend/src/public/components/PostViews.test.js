import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import api from '../../api/api';
import ViewsCount, { compactCount, countGuestView } from './PostViews';

jest.mock('../../api/api', () => ({ get: jest.fn(), post: jest.fn() }));

/** Post views (owner approved 2026-11-16: "count readers like Reels views"). */
test('the eye shows readers in short form; only the writer can open the numbers', async () => {
  expect([compactCount(950), compactCount(1240), compactCount(15000), compactCount(2300000)]).toEqual(['950', '1.2K', '15K', '2.3M']);
  const { rerender } = render(<ViewsCount post={{ id: 7, views: 1240 }} isOwner={false} />);
  expect(screen.getByTestId('post-views')).toHaveTextContent('1.2K');
  fireEvent.click(screen.getByTestId('post-views'));
  expect(screen.queryByTestId('views-sheet')).toBeNull();
  api.get.mockResolvedValue({ data: { total: 42, members: 12, guests: 30, fromShares: 21, days: [{ day: '2026-11-16', views: 9 }] } });
  rerender(<ViewsCount post={{ id: 7, views: 42 }} isOwner />);
  await act(async () => { fireEvent.click(screen.getByTestId('post-views')); });
  expect(api.get).toHaveBeenCalledWith('/feed-views/7');
  expect(screen.getByTestId('views-sheet')).toHaveTextContent('Wageni 21 walifika kupitia viungo');
  expect(screen.getByTestId('views-Wote')).toHaveTextContent('42');
});

test('a guest read is sent with a random browser key (no personal data), once per post', async () => {
  api.post.mockResolvedValue({ data: { counted: true } });
  await act(async () => { countGuestView(7); await Promise.resolve(); });
  expect(api.post).toHaveBeenCalledWith('/feed-views/7/guest', expect.objectContaining({ sessionKey: expect.stringMatching(/^[0-9a-zk]+/) }));
  countGuestView('cls-4');
  expect(api.post).toHaveBeenCalledTimes(1); // listings shown in the feed are not posts
});
