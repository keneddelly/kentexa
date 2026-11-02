import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import SuggestedCommunities from './SuggestedCommunities';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ get: jest.fn(), post: jest.fn() }));
beforeEach(() => { api.get.mockReset(); api.post.mockReset(); });

const c = (id, extra = {}) => ({ id, name: `Jumuiya ${id}`, topicKey: 'kilimo', joinPolicy: 'open', memberCount: 10 * id, myStatus: null, ...extra });

test('For You suggests real communities the viewer is not in, and "Jiunge" joins on the card (owner 2026-11-02)', async () => {
  api.get.mockResolvedValue({ data: [c(1, { myStatus: 'active' }), c(2), c(3, { joinPolicy: 'request' }), c(4), c(5), c(6), c(7), c(8)] });
  api.post.mockResolvedValue({ data: c(2, { myStatus: 'active', memberCount: 21 }) });
  const onSeeAll = jest.fn();
  await act(async () => { render(<SuggestedCommunities isLoggedIn onNavigate={jest.fn()} onSeeAll={onSeeAll} />); });
  expect(api.get).toHaveBeenCalledWith('/communities', { params: {} });
  expect(screen.queryByTestId('suggested-community-1')).toBeNull(); // already a member
  expect(screen.getAllByTestId(/^suggested-community-/)).toHaveLength(6);
  expect(screen.getByTestId('suggested-join-3')).toHaveTextContent('Omba kujiunga');
  await act(async () => { fireEvent.click(screen.getByTestId('suggested-join-2')); });
  expect(api.post).toHaveBeenCalledWith('/communities/2/join');
  expect(screen.getByTestId('suggested-join-2')).toHaveTextContent('Umejiunga');
  fireEvent.click(screen.getByTestId('suggested-see-all'));
  expect(onSeeAll).toHaveBeenCalled();
});

test('a topic chip narrows the suggestions; nothing to suggest shows nothing; a visitor is sent to log in', async () => {
  api.get.mockResolvedValue({ data: [] });
  let r;
  await act(async () => { r = render(<SuggestedCommunities isLoggedIn={false} onNavigate={jest.fn()} topic="kilimo" />); });
  expect(api.get).toHaveBeenCalledWith('/communities', { params: { topic: 'kilimo' } });
  expect(screen.queryByTestId('suggested-communities')).toBeNull();
  r.unmount();
  api.get.mockResolvedValue({ data: [c(4)] });
  const onNavigate = jest.fn();
  await act(async () => { render(<SuggestedCommunities isLoggedIn={false} onNavigate={onNavigate} />); });
  await act(async () => { fireEvent.click(screen.getByTestId('suggested-join-4')); });
  expect(onNavigate).toHaveBeenCalledWith('PublicLogin');
  expect(api.post).not.toHaveBeenCalled();
});
