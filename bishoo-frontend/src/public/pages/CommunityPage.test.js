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

test('an open community: its talk is readable, and "Jiunge" makes you a member (owner approved 2026-11-02)', async () => {
  answer({ '/communities/3': base, '/communities/3/posts': { items: [{ id: 7, title: 'Mvua zimeanza?', body: 'Mvua zimeanza?', createdAt: new Date().toISOString(), business: { id: 9, storeName: 'Ushirika Igoma' } }] } });
  api.post.mockResolvedValue({ data: { ...base, myStatus: 'active', myRole: 'member', memberCount: 13 } });
  const onOpenMoment = jest.fn();
  await act(async () => { render(<CommunityPage communityId={3} isLoggedIn onNavigate={jest.fn()} onOpenMoment={onOpenMoment} currentUser={{ id: 1 }} />); });
  expect(screen.getByTestId('community-head')).toHaveTextContent('Kilimo · Wanachama 12');
  expect(screen.getAllByTestId('feed-post')).toHaveLength(1);
  await act(async () => { fireEvent.click(screen.getByTestId('community-join')); });
  expect(api.post).toHaveBeenCalledWith('/communities/3/join');
  fireEvent.click(screen.getByTestId('community-post'));
  expect(onOpenMoment).toHaveBeenCalledWith('moment', { communityId: 3 });
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
    '/communities/3/posts': { items: [] },
  });
  api.post.mockResolvedValue({ data: { ok: true } });
  await act(async () => { render(<CommunityPage communityId={3} isLoggedIn onNavigate={jest.fn()} currentUser={{ id: 1 }} />); });
  expect(screen.getByTestId('community-requests')).toHaveTextContent('Juma');
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
