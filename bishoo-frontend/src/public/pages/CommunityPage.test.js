import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import CommunityPage from './CommunityPage';
import CreateCommunity from './CreateCommunity';
import CommunitiesPanel from '../components/CommunitiesPanel';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ get: jest.fn(), post: jest.fn() }));
beforeAll(() => { global.IntersectionObserver = class { observe() {} disconnect() {} }; });
beforeEach(() => { api.get.mockReset(); api.post.mockReset(); });

const base = { id: 3, name: 'Wakulima Mwanza', purpose: 'Mazao na bei', topicKey: 'kilimo', joinPolicy: 'open', memberCount: 12, myStatus: null, myRole: null };
const answer = (map) => api.get.mockImplementation(async (url) => ({ data: map[url] ?? [] }));

test('an open community: its talk is readable as a discussion list, and "Jiunge" makes you a member (owner approved 2026-11-02, #374 D)', async () => {
  answer({ '/communities/3': base, '/communities/3/threads': { total: 1, items: [{ id: 7, intent: 'question', title: 'Mvua zimeanza?', body: 'Mvua zimeanza?', createdAt: new Date().toISOString(), replyCount: 2, lastReplyAt: new Date().toISOString(), business: { id: 9, storeName: 'Ushirika Igoma' } }] } });
  api.post.mockResolvedValue({ data: { ...base, myStatus: 'active', myRole: 'member', memberCount: 13 } });
  const onOpenMoment = jest.fn();
  const onNavigate = jest.fn();
  await act(async () => { render(<CommunityPage communityId={3} isLoggedIn onNavigate={onNavigate} onOpenMoment={onOpenMoment} currentUser={{ id: 1 }} />); });
  expect(screen.getByTestId('community-head')).toHaveTextContent('Kilimo · 12 wanachama · Wazi kwa wote');
  expect(screen.getByTestId('thread-7')).toHaveTextContent('Swali');
  expect(screen.getByTestId('thread-7')).toHaveTextContent('Mvua zimeanza?');
  expect(screen.getByTestId('thread-meta')).toHaveTextContent('Ushirika Igoma · majibu 2 · jibu la mwisho sasa hivi');
  fireEvent.click(screen.getByTestId('thread-7'));
  expect(onNavigate).toHaveBeenCalledWith('PostDetail-7');
  await act(async () => { fireEvent.click(screen.getByTestId('community-join')); });
  expect(api.post).toHaveBeenCalledWith('/communities/3/join');
  expect(screen.getByTestId('community-joined')).toHaveTextContent('Umejiunga');
  fireEvent.click(screen.getByTestId('community-post'));
  expect(onOpenMoment).toHaveBeenCalledWith('moment', { communityId: 3 });
});

test('#374 D: pinned first with its label; a dot on news since the last visit; polls show votes', async () => {
  const now = new Date().toISOString();
  answer({ '/communities/3': { ...base, myStatus: 'active', myRole: 'member' }, '/communities/3/threads': { total: 3, items: [
    { id: 1, pinned: true, title: 'Karibu! Jitambulishe', body: 'karibu', createdAt: now, replyCount: 5, business: { id: 2, name: 'msimamizi' } },
    { id: 2, intent: 'discussion', unread: true, title: '', body: 'usafirishaji kwenda mikoani', createdAt: now, replyCount: 0, business: { id: 4, name: 'Juma' } },
    { id: 3, intent: 'poll', title: 'Siku gani?', body: 'Siku gani?', createdAt: now, poll: { votes: 9, closesAt: new Date(Date.now() + 3 * 86400000).toISOString() }, business: { id: 5, name: 'Asha' } },
  ] } });
  await act(async () => { render(<CommunityPage communityId={3} isLoggedIn onNavigate={jest.fn()} currentUser={{ id: 1 }} />); });
  expect(screen.getByTestId('thread-1')).toHaveTextContent('Imebandikwa na msimamizi');
  expect(screen.getByTestId('thread-2')).toHaveTextContent('Usafirishaji kwenda mikoani');
  expect(screen.getAllByTestId('thread-unread')).toHaveLength(1);
  expect(screen.getByTestId('thread-3')).toHaveTextContent('kura 9');
  expect(screen.getByTestId('thread-3')).toHaveTextContent('zimebaki siku');
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
