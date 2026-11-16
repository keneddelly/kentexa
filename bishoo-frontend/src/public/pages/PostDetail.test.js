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

test('a share is counted only after the link was really shared (C10: through the share sheet)', async () => {
  answerPost(post);
  api.post.mockImplementation(async (url) => (url === '/share-links'
    ? { data: { links: { native: 'https://kentexa.com/s/Nat1234', copy: 'https://kentexa.com/s/Cop1234' } } }
    : { data: { toggled: true } }));
  global.fetch = jest.fn().mockResolvedValue({ ok: false });
  const share = jest.fn().mockRejectedValueOnce(new Error('cancelled')).mockResolvedValueOnce(undefined);
  Object.defineProperty(navigator, 'share', { value: share, configurable: true });
  await open();
  await act(async () => { fireEvent.click(screen.getByTestId('post-share')); });
  expect(screen.getByTestId('share-sheet')).toBeInTheDocument();
  expect(api.post).toHaveBeenCalledWith('/share-links', expect.objectContaining({ contentType: 'post', contentId: 7 }));
  await act(async () => { fireEvent.click(screen.getByTestId('share-native')); });
  expect(api.post).not.toHaveBeenCalledWith('/feed/7/engage', { type: 'share' });
  await act(async () => { fireEvent.click(screen.getByTestId('share-native')); });
  expect(share).toHaveBeenLastCalledWith(expect.objectContaining({ url: 'https://kentexa.com/s/Nat1234' }));
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
  // #374 C: a "Jibu" box under the post and a reply bar fixed above the bottom bar.
  expect(screen.getByTestId('reply-under-post')).toBeInTheDocument();
  expect(screen.getByTestId('reply-bar')).toHaveAttribute('data-fixed-bar');
});

const thread = [
  { id: 11, body: 'biashara ya mayai.', authorId: 5, helpfulCount: 3, likedByMe: false, createdAt: new Date().toISOString(),
    author: { id: 5, name: 'asha m.' },
    replies: [
      { id: 12, body: 'Asante', authorId: 3, helpfulCount: 0, createdAt: new Date().toISOString(), author: { id: 3, name: 'Kened' } },
      { id: 13, body: 'Mimi pia', authorId: 6, helpfulCount: 0, createdAt: new Date().toISOString(), author: { id: 6, name: 'Juma' } },
      { id: 14, body: 'Sawa', authorId: 7, helpfulCount: 0, createdAt: new Date().toISOString(), author: { id: 7, name: 'Neema' } },
    ] },
];
const answerThread = () => api.get.mockImplementation(async (url) => ({ data: url === '/feed/7' ? { ...post, businessId: 3 } : thread }));

test('#374 C: comments are a conversation: names tidy, visible Jibu and Penda buttons, replies under their comment', async () => {
  answerThread();
  await open();
  const top = screen.getByTestId('comment');
  expect(top).toHaveTextContent('Asha m.');
  expect(top).toHaveTextContent('Biashara ya mayai.');
  expect(screen.getAllByTestId('comment-reply')).toHaveLength(1);
  expect(screen.getAllByTestId('comment-reply')[0]).toHaveTextContent('Kened · mwandishi');
  fireEvent.click(screen.getByTestId('comment-more-replies'));
  expect(screen.getAllByTestId('comment-reply')).toHaveLength(3);
  expect(screen.getAllByTestId('comment-like')[0]).toHaveAccessibleName('Penda, 3');
});

test('#374 C: a reply to a reply goes under the same comment, and Penda toggles', async () => {
  answerThread();
  await open();
  fireEvent.click(screen.getAllByTestId('comment-reply-btn')[1]); // reply to Kened's reply
  expect(screen.getByTestId('reply-input')).toHaveAttribute('placeholder', 'Jibu kwa Kened…');
  fireEvent.change(screen.getByTestId('reply-input'), { target: { value: 'karibu' } });
  api.post.mockResolvedValueOnce({ data: { id: 20, body: 'karibu', author: { id: 1, name: 'Me' } } });
  await act(async () => { fireEvent.click(screen.getByTestId('reply-send')); });
  expect(api.post).toHaveBeenCalledWith('/feed/7/comments', { body: 'karibu', parentId: 11 });

  api.post.mockResolvedValueOnce({ data: { helpful: true, helpfulCount: 4 } });
  await act(async () => { fireEvent.click(screen.getAllByTestId('comment-like')[0]); });
  expect(api.post).toHaveBeenCalledWith('/comments/11/helpful');
  expect(screen.getAllByTestId('comment-like')[0]).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getAllByTestId('comment-like')[0]).toHaveAccessibleName('Penda, 4');
});

// ── #374 D: a community discussion ──
const communityPost = { ...post, businessId: 5, community: { id: 3, name: 'wafanyabiashara kariakoo' }, bestCommentId: 12, repliesLocked: false };
const communityThread = [
  { id: 11, body: 'Mayai', authorId: 6, createdAt: new Date().toISOString(), author: { id: 6, name: 'Asha' }, replies: [] },
  { id: 12, body: 'Accessories za simu', authorId: 7, createdAt: new Date().toISOString(), author: { id: 7, name: 'Juma' }, replies: [] },
];
const answerCommunity = (p, role) => api.get.mockImplementation(async (url) => ({
  data: url === '/feed/7' ? p : url === '/communities/3' ? { id: 3, myStatus: role ? 'active' : null, myRole: role } : communityThread,
}));

test('#374 D: the header names the community; the chosen reply shows first as "Jibu bora"', async () => {
  answerCommunity(communityPost, 'member');
  const onNavigate = await open();
  expect(screen.getByTestId('post-from-community')).toHaveTextContent('kutoka Wafanyabiashara kariakoo');
  expect(screen.getByTestId('best-answer')).toHaveTextContent('Accessories za simu');
  expect(screen.queryByTestId('moderator-menu')).toBeNull(); // a member is not a moderator
  expect(screen.queryByTestId('comment-best')).toBeNull(); // nor the writer
  fireEvent.click(screen.getByTestId('post-from-community'));
  expect(onNavigate).toHaveBeenCalledWith('Community-3');
});

test('#374 D: the writer chooses a reply as "Jibu bora"', async () => {
  answerCommunity({ ...communityPost, businessId: 1, bestCommentId: null }, 'member');
  await open();
  api.post.mockResolvedValueOnce({ data: { bestCommentId: 11 } });
  await act(async () => { fireEvent.click(screen.getAllByTestId('comment-best')[0]); });
  expect(api.post).toHaveBeenCalledWith('/communities/3/posts/7/best-answer', { commentId: 11 });
  expect(screen.getByTestId('best-answer')).toHaveTextContent('Mayai');
});

test('#374 D: a moderator pins and closes replies; closed replies hide the reply box', async () => {
  answerCommunity(communityPost, 'helper');
  await open();
  fireEvent.click(screen.getByTestId('moderator-menu'));
  api.post.mockResolvedValueOnce({ data: { pinned: true } });
  await act(async () => { fireEvent.click(screen.getByTestId('mod-pin')); });
  expect(api.post).toHaveBeenCalledWith('/communities/3/posts/7/pin', { pinned: true });
  expect(screen.getByTestId('moderator-note')).toHaveTextContent('Limebandikwa juu ya jumuiya.');
  fireEvent.click(screen.getByTestId('moderator-menu'));
  api.post.mockResolvedValueOnce({ data: { repliesLocked: true } });
  await act(async () => { fireEvent.click(screen.getByTestId('mod-lock')); });
  expect(screen.getByTestId('replies-locked')).toBeInTheDocument();
  expect(screen.queryByTestId('reply-bar')).toBeNull();
});

// ── #381 B: write first, join after ──
test('B: a guest can type a reply; sending it opens the invitation with real names', async () => {
  const GuestJoinSheet = require('../components/GuestJoinSheet').default;
  answerThread();
  render(<GuestJoinSheet onNavigate={jest.fn()} />);
  await act(async () => { render(<PostDetail postId={7} isLoggedIn={false} onNavigate={jest.fn()} />); });
  fireEvent.change(screen.getByTestId('reply-input'), { target: { value: 'Mimi naona mayai' } });
  await act(async () => { fireEvent.click(screen.getByTestId('reply-send')); });
  expect(screen.getByTestId('guest-join')).toBeInTheDocument();
  expect(screen.getByTestId('guest-draft')).toHaveValue('Mimi naona mayai');
  expect(screen.getByTestId('guest-join-people')).toHaveTextContent('Asha m., Kened na wengine 2 wanajadili hili');
  expect(api.post).not.toHaveBeenCalled();
});

test('B: back after registering, the reply written as a guest is ready to send', async () => {
  window.localStorage.setItem('kx_guest_draft', JSON.stringify({ postId: 7, body: 'Mimi naona mayai', parentId: 11, replyName: 'Asha m.', at: Date.now() }));
  answerThread();
  await open();
  expect(screen.getByTestId('reply-input')).toHaveValue('Mimi naona mayai');
  expect(screen.getByTestId('reply-input')).toHaveAttribute('placeholder', 'Jibu kwa Asha m.…');
  expect(screen.getByTestId('reply-restored')).toBeInTheDocument();
  expect(window.localStorage.getItem('kx_guest_draft')).toBeNull();
});

// ── #381 C11: share at the right moment ──
test('C11: the writer of a discussion with 10 replies is invited once to put it on Status', async () => {
  window.localStorage.removeItem('kx_nudges');
  answerPost({ ...post, businessId: 1, commentCount: 10 });
  await open();
  expect(screen.getByTestId('hot-nudge')).toHaveTextContent('Mjadala wako unavuma: majibu 10');
  fireEvent.click(screen.getByTestId('hot-nudge-later'));
  expect(screen.queryByTestId('hot-nudge')).toBeNull();
  expect(window.localStorage.getItem('kx_nudges')).toContain('hot-7');
});

test('C11: not the writer, or fewer than 10 replies: no nudge', async () => {
  window.localStorage.removeItem('kx_nudges');
  answerPost({ ...post, businessId: 3, commentCount: 40 });
  await open();
  expect(screen.queryByTestId('hot-nudge')).toBeNull();
});
