import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { PostCard } from './HomeFeed';

jest.mock('../../api/api', () => ({ get: jest.fn(() => Promise.resolve({ data: [] })), post: jest.fn(() => Promise.resolve({ data: {} })) }));

beforeAll(() => { global.IntersectionObserver = class { observe() {} disconnect() {} }; });

const base = {
  id: 7, type: 'moment', intent: 'question', title: 'wafanya biashara kariakoo', body: 'hivi ni biashara gani?',
  createdAt: new Date(Date.now() - 3 * 86400000).toISOString(), likeCount: 4, commentCount: 2,
  topic: 'teknolojia',
  business: { id: 3, name: 'kened', username: 'kened', actorType: 'PERSONAL', businessLocation: 'Keko, Temeke', isFollowing: true },
};

const show = async (post) => { await act(async () => { render(<PostCard post={post} isLoggedIn onNavigate={jest.fn()} currentUser={{ id: 1 }} />); }); };

test('#374 B: name · @handle · time; no "Moment" label; kind, topic and place on one line under it', async () => {
  await show(base);
  expect(screen.getAllByRole('button', { name: 'Kened' }).length).toBeGreaterThan(0);
  expect(screen.getByTestId('post-byline').textContent).toMatch(/^ @kened · /);
  expect(screen.getByTestId('post-meta')).toHaveTextContent('Keko, Temeke');
  expect(screen.getByTestId('post-topic')).toBeInTheDocument();
  expect(screen.queryByTestId('post-kind')).toBeNull(); // a Moment needs no label
  expect(screen.getByTestId('post-text').textContent).toBe('Wafanya biashara kariakoo: Hivi ni biashara gani?');
});

test('#374 B: every Home action is a visible button with its count', async () => {
  await show(base);
  const like = screen.getByTestId('post-like');
  expect(like).toHaveTextContent('4');
  expect(like.style.background).not.toBe('none');
  expect(like.style.borderRadius).toBe('999px');
});

test('#374 B: no handle known, the time still shows', async () => {
  await show({ ...base, business: { ...base.business, username: null } });
  expect(screen.getByTestId('post-byline').textContent).toMatch(/^ · /);
});
