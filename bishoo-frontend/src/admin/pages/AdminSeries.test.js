import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import AdminSeries from './AdminSeries';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), put: jest.fn(), delete: jest.fn() } }));
jest.mock('../components/Sidebar', () => () => null);

// Mfululizo na Mada (#410 phase 3, owner approved 2026-11-17).
const topics = [{ key: 'biashara', label: 'Biashara', note: 'Bei, wateja', description: null, position: 1, active: true, posts: 40, followers: 12 }];
const series = {
  id: 12, title: 'Business Conversations', status: 'draft', description: '', coverUrl: null, topics: [], communityId: null, path: '/series/12-business-conversations',
  episodeList: [
    { postId: 7, title: 'The Cashless Economy', visible: true },
    { postId: 9, title: 'AI in Small Businesses', visible: false },
  ],
};

beforeEach(() => {
  api.get.mockImplementation((url) => Promise.resolve({ data: url === '/topics/admin' ? topics : url === '/series/admin/all' ? [{ ...series, episodes: 2, followers: 0 }] : series }));
});

test('admin opens a series, moves an episode up, attaches a post by its link and publishes', async () => {
  api.put.mockResolvedValue({ data: { ...series, episodeList: [series.episodeList[1], series.episodeList[0]] } });
  api.post.mockResolvedValue({ data: series });
  api.patch.mockResolvedValue({ data: { ...series, status: 'published' } });
  await act(async () => { render(<AdminSeries activePage="AdminSeries" onNavigate={jest.fn()} onLogout={jest.fn()} />); });
  await act(async () => { fireEvent.click(screen.getByTestId('series-row-12')); });
  expect(screen.getByTestId('series-ep-9')).toHaveTextContent('halionekani');
  await act(async () => { fireEvent.click(screen.getByTestId('series-up-9')); });
  expect(api.put).toHaveBeenCalledWith('/series/12/episodes/order', { postIds: [9, 7] });
  fireEvent.change(screen.getByTestId('series-add-post'), { target: { value: 'https://kentexa.com/post/42-je-biashara' } });
  await act(async () => { fireEvent.click(screen.getByTestId('series-add')); });
  expect(api.post).toHaveBeenCalledWith('/series/12/episodes', { post: 'https://kentexa.com/post/42-je-biashara', title: undefined });
  await act(async () => { fireEvent.click(screen.getByTestId('series-publish')); });
  expect(api.patch).toHaveBeenCalledWith('/series/12', { status: 'published' });
});

test('admin creates a series and adds a topic', async () => {
  api.post.mockImplementation((url) => Promise.resolve({ data: url === '/series' ? { id: 12 } : {} }));
  await act(async () => { render(<AdminSeries activePage="AdminSeries" onNavigate={jest.fn()} onLogout={jest.fn()} />); });
  fireEvent.change(screen.getByTestId('series-new-title'), { target: { value: 'Business Conversations' } });
  await act(async () => { fireEvent.click(screen.getByTestId('series-create')); });
  expect(api.post).toHaveBeenCalledWith('/series', { title: 'Business Conversations' });
  expect(screen.getByTestId('series-editor')).toBeInTheDocument();

  await act(async () => { fireEvent.click(screen.getByText('← Mfululizo yote')); });
  await act(async () => { fireEvent.click(screen.getByTestId('admin-series-tab-topics')); });
  expect(screen.getByTestId('topic-row-biashara')).toHaveTextContent('machapisho 40');
  fireEvent.change(screen.getByTestId('topic-new-key'), { target: { value: 'Elimu' } });
  fireEvent.change(screen.getByTestId('topic-new-label'), { target: { value: 'Elimu' } });
  await act(async () => { fireEvent.click(screen.getByTestId('topic-add')); });
  expect(api.post).toHaveBeenCalledWith('/topics/admin', { key: 'elimu', label: 'Elimu', note: '' });
});
