import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import CommunityPage from './CommunityPage';
import CreateCommunity from './CreateCommunity';
import CommunitiesPanel from '../components/CommunitiesPanel';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ get: jest.fn(), post: jest.fn() }));
beforeAll(() => { global.IntersectionObserver = class { observe() {} disconnect() {} }; });
beforeEach(() => { api.get.mockReset(); api.post.mockReset(); });

const base = { id: 3, name: 'Wakulima Mwanza', purpose: 'Mazao na bei', topicKey: 'kilimo', joinPolicy: 'open', memberCount: 12, myStatus: null, myRole: null };
const answer = (map) => api.get.mockImplementation(async (url) => ({ data: map[url] ?? [] }));

test('an open community: its talk is readable as discussion cards, and "Jiunge" makes you a member (owner approved 2026-11-02, D2 2026-11-16)', async () => {
  answer({ '/communities/3': base, '/communities/3/members': [{ userId: 1, name: 'kened', role: 'admin' }, { userId: 2, name: 'Bob', role: 'member' }],
    '/communities/3/threads': { total: 1, unanswered: 0, items: [{ id: 7, intent: 'question', title: 'Mvua zimeanza?', body: 'Mvua zimeanza?', createdAt: new Date().toISOString(), replyCount: 2,
      lastReplyAt: new Date().toISOString(), participants: [{ name: 'bob juma', photo: null }], bestCommentId: 4, business: { id: 9, storeName: 'ushirika wa igoma' } }] } });
  api.post.mockResolvedValue({ data: { ...base, myStatus: 'active', myRole: 'member', memberCount: 13 } });
  const onOpenMoment = jest.fn();
  const onNavigate = jest.fn();
  await act(async () => { render(<CommunityPage communityId={3} isLoggedIn onNavigate={onNavigate} onOpenMoment={onOpenMoment} currentUser={{ id: 1 }} />); });
  expect(screen.getByTestId('community-kind')).toHaveTextContent('Jumuiya ya umma · Kilimo');
  expect(screen.getByTestId('community-people')).toHaveTextContent('Kened, Bob na wengine 10 ni wanachama');
  const card = screen.getByTestId('thread-7');
  expect(within(card).getByTestId('thread-kind')).toHaveTextContent('SWALI');
  expect(within(card).getByTestId('thread-answered')).toHaveTextContent('Imejibiwa');
  expect(within(card).getByTestId('thread-title')).toHaveTextContent('Mvua zimeanza?');
  expect(card).toHaveTextContent('Ushirika wa Igoma');
  expect(within(card).getByTestId('thread-meta')).toHaveTextContent('Majibu 2 · la mwisho sasa hivi, Bob Juma');
  fireEvent.click(card);
  expect(onNavigate).toHaveBeenCalledWith('PostDetail-7');
  await act(async () => { fireEvent.click(screen.getByTestId('community-join')); });
  expect(api.post).toHaveBeenCalledWith('/communities/3/join');
  expect(screen.getByTestId('community-joined')).toHaveTextContent('Umejiunga');
  fireEvent.click(screen.getByTestId('community-post'));
  expect(onOpenMoment).toHaveBeenCalledWith('moment', { communityId: 3 });
  fireEvent.click(screen.getByTestId('community-start-poll'));
  expect(onOpenMoment).toHaveBeenLastCalledWith('moment', { communityId: 3, kind: 'poll' });
});

test('D2: pinned together at the top; MPYA on news; a card with no reply asks for the first; poll bars only with results', async () => {
  const now = new Date().toISOString();
  const closes = new Date(Date.now() + 3 * 86400000).toISOString();
  answer({ '/communities/3': { ...base, myStatus: 'active', myRole: 'member' }, '/communities/3/threads': { total: 4, unanswered: 1, items: [
    { id: 1, pinned: true, title: 'Karibu! Jitambulishe', body: 'karibu', createdAt: now, replyCount: 5, business: { id: 2, name: 'msimamizi' } },
    { id: 2, intent: 'discussion', unread: true, title: '', body: 'usafirishaji kwenda mikoani\nnani anajua bei ya lori?', createdAt: now, replyCount: 0, business: { id: 4, name: 'Juma' } },
    { id: 3, intent: 'poll', title: 'Siku gani?', body: 'Siku gani?', createdAt: now, business: { id: 5, name: 'Asha' },
      poll: { votes: 10, closesAt: closes, showResults: true, voted: true, options: [{ label: 'Jumamosi', pct: 60 }, { label: 'Jumatatu', pct: 40 }] } },
    { id: 4, intent: 'poll', title: 'Wapi?', body: 'Wapi?', createdAt: now, business: { id: 5, name: 'Asha' },
      poll: { votes: 2, closesAt: closes, showResults: false, options: [{ label: 'Kariakoo', pct: null }] } },
  ] } });
  await act(async () => { render(<CommunityPage communityId={3} isLoggedIn onNavigate={jest.fn()} currentUser={{ id: 1 }} />); });
  expect(screen.getByTestId('community-pinned')).toHaveTextContent('IMEBANDIKWA');
  expect(screen.getByTestId('thread-1')).toHaveTextContent('Msimamizi · majibu 5');
  const talk = screen.getByTestId('thread-2');
  expect(within(talk).getByTestId('thread-title')).toHaveTextContent('Usafirishaji kwenda mikoani');
  expect(within(talk).getByTestId('thread-excerpt')).toHaveTextContent('Nani anajua bei ya lori?');
  expect(within(talk).getByTestId('thread-kind')).toHaveTextContent('MJADALA');
  expect(within(talk).getByTestId('thread-first-reply')).toHaveTextContent('Kuwa wa kwanza kujibu');
  expect(screen.getAllByTestId('thread-unread')).toHaveLength(1);
  expect(screen.getByTestId('thread-3')).toHaveTextContent('60%');
  expect(screen.getByTestId('thread-3')).toHaveTextContent('kura 10');
  expect(screen.getByTestId('thread-3')).toHaveTextContent('Umepiga kura');
  expect(screen.getByTestId('thread-4')).not.toHaveTextContent('%');
  expect(screen.getByTestId('thread-4')).toHaveTextContent('Piga kura →');
  expect(screen.getByTestId('community-sort-unanswered')).toHaveTextContent('Hazijajibiwa · 1');
});

test('D2: sorting and searching ask the server again', async () => {
  answer({ '/communities/3': base, '/communities/3/threads': { total: 0, unanswered: 0, items: [] } });
  await act(async () => { render(<CommunityPage communityId={3} isLoggedIn onNavigate={jest.fn()} currentUser={{ id: 1 }} />); });
  await act(async () => { fireEvent.click(screen.getByTestId('community-sort-top')); });
  expect(api.get).toHaveBeenLastCalledWith('/communities/3/threads', { params: { page: 1, sort: 'top' } });
  jest.useFakeTimers();
  fireEvent.click(screen.getByTestId('community-search-open'));
  fireEvent.change(screen.getByTestId('community-search'), { target: { value: 'bei' } });
  await act(async () => { jest.advanceTimersByTime(400); });
  jest.useRealTimers();
  await act(async () => {});
  expect(api.get).toHaveBeenLastCalledWith('/communities/3/threads', { params: { page: 1, sort: 'top', q: 'bei' } });
  expect(screen.getByTestId('community-empty')).toHaveTextContent('Hakuna kilichopatikana kwa "bei"');
});

test('#374 D: the menu: rules, members and leave', async () => {
  answer({ '/communities/3': { ...base, rules: 'heshimu wengine', myStatus: 'active', myRole: 'member' }, '/communities/3/threads': { total: 0, items: [] } });
  api.post.mockResolvedValue({ data: { ...base, myStatus: null } });
  await act(async () => { render(<CommunityPage communityId={3} isLoggedIn onNavigate={jest.fn()} currentUser={{ id: 1 }} />); });
  fireEvent.click(screen.getByTestId('community-rules-toggle'));
  expect(screen.getByTestId('community-rules')).toHaveTextContent('Heshimu wengine');
  fireEvent.click(screen.getByTestId('community-menu'));
  await act(async () => { fireEvent.click(screen.getByTestId('community-leave')); });
  expect(api.post).toHaveBeenCalledWith('/communities/3/leave');
});

test('a request community: talk is for members only; a moderator sees and approves requests', async () => {
  answer({ '/communities/3': { ...base, joinPolicy: 'request' } });
  await act(async () => { render(<CommunityPage communityId={3} isLoggedIn onNavigate={jest.fn()} currentUser={{ id: 1 }} />); });
  expect(screen.getByTestId('community-members-only')).toBeInTheDocument();
  expect(screen.getByTestId('community-join')).toHaveTextContent('Omba kujiunga');
});

test('the admin sees join requests and approves one', async () => {
  answer({
    '/communities/3': { ...base, joinPolicy: 'request', myStatus: 'active', myRole: 'admin' },
    '/communities/3/requests': [{ userId: 44, name: 'Juma' }],
    '/communities/3/threads': { items: [], total: 0 },
  });
  api.post.mockResolvedValue({ data: { ok: true } });
  await act(async () => { render(<CommunityPage communityId={3} isLoggedIn onNavigate={jest.fn()} currentUser={{ id: 1 }} />); });
  expect(screen.getByTestId('community-requests')).toHaveTextContent('Juma');
  fireEvent.click(screen.getByTestId('community-menu'));
  expect(screen.queryByTestId('community-leave')).toBeNull(); // the admin cannot leave
  await act(async () => { fireEvent.click(screen.getByTestId('approve-44')); });
  expect(api.post).toHaveBeenCalledWith('/communities/3/requests/44', { approve: true });
  expect(screen.queryByTestId('community-requests')).toBeNull();
});

test('opening a community: name, purpose and topic are needed; then it opens', async () => {
  answer({ '/feed/topics': [{ key: 'kilimo', label: 'Kilimo' }] });
  api.post.mockResolvedValue({ data: { id: 5 } });
  const onNavigate = jest.fn();
  await act(async () => { render(<CreateCommunity isLoggedIn onNavigate={onNavigate} />); });
  await act(async () => { fireEvent.click(screen.getByTestId('community-create')); });
  expect(screen.getByRole('alert')).toHaveTextContent('Jaza jina');
  fireEvent.change(screen.getByTestId('community-name'), { target: { value: 'Wakulima Mwanza' } });
  fireEvent.change(screen.getByTestId('community-purpose'), { target: { value: 'Mazao na bei' } });
  fireEvent.click(screen.getByTestId('community-topic-kilimo'));
  fireEvent.click(screen.getByTestId('community-request'));
  await act(async () => { fireEvent.click(screen.getByTestId('community-create')); });
  expect(api.post).toHaveBeenCalledWith('/communities', expect.objectContaining({ name: 'Wakulima Mwanza', topicKey: 'kilimo', joinPolicy: 'request' }));
  expect(onNavigate).toHaveBeenCalledWith('Community-5');
});

test('the Jumuiya tab: your communities, and ones to join', async () => {
  api.get.mockImplementation(async (url, cfg) => ({ data: cfg?.params?.mine ? [{ ...base, myStatus: 'active' }] : [{ ...base, id: 8, name: 'Teknolojia Tanzania', topicKey: 'teknolojia' }] }));
  api.post.mockResolvedValue({ data: { ...base, id: 8, name: 'Teknolojia Tanzania', myStatus: 'active' } });
  const onNavigate = jest.fn();
  await act(async () => { render(<CommunitiesPanel isLoggedIn onNavigate={onNavigate} />); });
  fireEvent.click(screen.getByTestId('my-community-3'));
  expect(onNavigate).toHaveBeenCalledWith('Community-3');
  await act(async () => { fireEvent.click(screen.getByTestId('join-8')); });
  expect(api.post).toHaveBeenCalledWith('/communities/8/join');
  expect(screen.getByTestId('my-community-8')).toBeInTheDocument();
});
