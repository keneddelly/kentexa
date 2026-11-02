import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import PostDetail from './PostDetail';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ get: jest.fn(), post: jest.fn() }));

const post = {
  id: 7, type: 'moment', title: 'Mzigo mpya', body: 'Mzigo mpya', createdAt: new Date().toISOString(),
  likeCount: 2, saveCount: 1, shareCount: 0, commentCount: 0, isLiked: false, isSaved: true,
  business: { id: 3, storeName: 'Bishoo Electronics', isFollowing: true },
};

beforeAll(() => {
  global.IntersectionObserver = class { observe() {} disconnect() {} };
});
beforeEach(() => { api.get.mockReset(); api.post.mockReset(); });
// The post page also opens its comments: they answer an empty list.
const answerPost = (p) => api.get.mockImplementation(async (url) => ({ data: url === '/feed/7' ? p : [] }));

const open = async (props = {}) => {
  const onNavigate = jest.fn();
  await act(async () => { render(<PostDetail postId={7} isLoggedIn onNavigate={onNavigate} currentUser={{ id: 1 }} {...props} />); });
  return onNavigate;
};

test('shows the post the server returns, with its likes and its save', async () => {
  answerPost(post);
  await open();
  expect(api.get).toHaveBeenCalledWith('/feed/7');
  expect(screen.getByTestId('post-like')).toHaveTextContent('2');
  expect(screen.getByTestId('post-like')).toHaveAttribute('aria-pressed', 'false');
  expect(screen.getByTestId('post-save')).toHaveAttribute('aria-pressed', 'true');
});

test('the heart is a like, not a save', async () => {
  answerPost(post);
  api.post.mockResolvedValue({ data: { toggled: true } });
  await open();
  await act(async () => { fireEvent.click(screen.getByTestId('post-like')); });
  expect(api.post).toHaveBeenCalledWith('/feed/7/engage', { type: 'like' });
  expect(screen.getByTestId('post-like')).toHaveTextContent('3');
  expect(screen.getByTestId('post-like')).toHaveAttribute('aria-pressed', 'true');
});

test('a share is counted only after the link was really shared', async () => {
  answerPost(post);
  api.post.mockResolvedValue({ data: { toggled: true } });
  const share = jest.fn().mockRejectedValueOnce(new Error('cancelled')).mockResolvedValueOnce(undefined);
  Object.defineProperty(navigator, 'share', { value: share, configurable: true });
  await open();
  await act(async () => { fireEvent.click(screen.getByTestId('post-share')); });
  expect(api.post).not.toHaveBeenCalled();
  await act(async () => { fireEvent.click(screen.getByTestId('post-share')); });
  expect(share).toHaveBeenLastCalledWith(expect.objectContaining({ url: 'https://kentexa.com/post/7' }));
  expect(api.post).toHaveBeenCalledWith('/feed/7/engage', { type: 'share' });
  expect(screen.getByTestId('post-share')).toHaveTextContent('1');
  delete navigator.share;
});

test('a post that does not load says so; nothing is guessed', async () => {
  api.get.mockRejectedValue({ response: { status: 404 } });
  const onNavigate = await open();
  expect(screen.getByTestId('post-missing')).toHaveTextContent('Chapisho halipatikani');
  fireEvent.click(screen.getByText('Nenda Mwanzo'));
  expect(onNavigate).toHaveBeenCalledWith('Home');
});

test('phase F: repost on a post for everyone, "X amesambaza", and the ··· menu for someone else\'s post', async () => {
  answerPost({ ...post, businessId: 3, visibility: 'public', repostCount: 4, repostedBy: { name: 'Neema Mushi' } });
  api.post.mockResolvedValue({ data: { toggled: true } });
  await open();
  expect(screen.getByTestId('reposted-by')).toHaveTextContent('Neema Mushi amesambaza');
  await act(async () => { fireEvent.click(screen.getByTestId('post-repost')); });
  expect(api.post).toHaveBeenCalledWith('/feed/7/engage', { type: 'repost' });
  expect(screen.getByTestId('post-repost')).toHaveTextContent('5');
  fireEvent.click(screen.getByTestId('post-more'));
  expect(screen.getByTestId('post-menu')).toBeInTheDocument();
});

test('phase F: a followers-only post has no repost; the author gets no ··· menu', async () => {
  answerPost({ ...post, businessId: 1, visibility: 'followers' });
  await open();
  expect(screen.queryByTestId('post-repost')).toBeNull();
  expect(screen.queryByTestId('post-more')).toBeNull();
});

test('the post page is a full page, not a feed row: big author block, full text, its date, comments open', async () => {
  answerPost({ ...post, body: 'Mzigo mpya umefika leo. '.repeat(20), createdAt: '2026-11-02T07:20:00Z' });
  await open();
  expect(screen.getByTestId('feed-post')).toHaveAttribute('data-variant', 'detail');
  expect(screen.getByTestId('detail-avatar')).toBeInTheDocument();
  expect(screen.getByTestId('detail-text')).toHaveTextContent('Mzigo mpya umefika leo.');
  expect(screen.queryByTestId('read-more')).toBeNull();
  expect(screen.getByTestId('detail-time')).toHaveTextContent(/\d{2}:\d{2} · 2 Nov 2026/);
  expect(screen.getAllByText('Maoni').length).toBeGreaterThan(0);
});
