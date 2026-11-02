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

const open = async (props = {}) => {
  const onNavigate = jest.fn();
  await act(async () => { render(<PostDetail postId={7} isLoggedIn onNavigate={onNavigate} currentUser={{ id: 1 }} {...props} />); });
  return onNavigate;
};

test('shows the post the server returns, with its likes and its save', async () => {
  api.get.mockResolvedValue({ data: post });
  await open();
  expect(api.get).toHaveBeenCalledWith('/feed/7');
  expect(screen.getByTestId('post-like')).toHaveTextContent('2');
  expect(screen.getByTestId('post-like')).toHaveAttribute('aria-pressed', 'false');
  expect(screen.getByTestId('post-save')).toHaveAttribute('aria-pressed', 'true');
});

test('the heart is a like, not a save', async () => {
  api.get.mockResolvedValue({ data: post });
  api.post.mockResolvedValue({ data: { toggled: true } });
  await open();
  await act(async () => { fireEvent.click(screen.getByTestId('post-like')); });
  expect(api.post).toHaveBeenCalledWith('/feed/7/engage', { type: 'like' });
  expect(screen.getByTestId('post-like')).toHaveTextContent('3');
  expect(screen.getByTestId('post-like')).toHaveAttribute('aria-pressed', 'true');
});

test('a share is counted only after the link was really shared', async () => {
  api.get.mockResolvedValue({ data: post });
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
