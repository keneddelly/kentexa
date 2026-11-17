import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import SeriesPage from './SeriesPage';
import SeriesBar from '../components/SeriesBar';
import TopicPage from './TopicPage';
import api from '../../api/api';
import { pageToAddress, pathToPage } from '../../utils/urlSync';

jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), delete: jest.fn() } }));
jest.mock('./HomeFeed', () => ({ PostCard: ({ post }) => <div data-testid={`post-${post.id}`}>{post.body}</div> }));

// Mfululizo (issue #410 phase 2, owner approved 2026-11-17).
const series = {
  id: 12, title: 'Business Conversations', description: 'Mazungumzo ya biashara kila wiki.', coverUrl: null, path: '/series/12-business-conversations',
  publisher: 'KenteXa', topics: ['biashara'], episodes: 2, followers: 40, following: false,
  episodeList: [
    { postId: 7, number: 1, title: 'The Cashless Economy', summary: 'Je, biashara yako iko tayari kwa uchumi usiotumia cash?', intent: 'discussion', replies: 9 },
    { postId: 9, number: 2, title: 'AI in Small Businesses', summary: '', intent: 'question', replies: 0 },
  ],
};

test('a series: title, publisher, episodes in order; an episode opens its post; Fuata follows', async () => {
  api.get.mockImplementation((url) => Promise.resolve({ data: url === '/series/12' ? series : [{ key: 'biashara', label: 'Biashara' }] }));
  api.post.mockResolvedValue({ data: { following: true, followers: 41 } });
  const onNavigate = jest.fn();
  await act(async () => { render(<SeriesPage seriesId={12} onNavigate={onNavigate} isLoggedIn />); });
  expect(screen.getByTestId('series-title')).toHaveTextContent('Business Conversations');
  expect(screen.getByTestId('series-episodes')).toHaveTextContent('01');
  expect(screen.getByTestId('series-topic-biashara')).toHaveTextContent('Biashara');
  fireEvent.click(screen.getByTestId('series-episode-9'));
  expect(onNavigate).toHaveBeenCalledWith('PostDetail-9');
  await act(async () => { fireEvent.click(screen.getByTestId('series-follow')); });
  expect(api.post).toHaveBeenCalledWith('/series/12/follow');
  expect(screen.getByTestId('series-follow')).toHaveTextContent('Unafuata');
});

test('a guest who taps Fuata signs in and comes back to the series', async () => {
  api.get.mockImplementation((url) => Promise.resolve({ data: url === '/series/12' ? series : [] }));
  const onNavigate = jest.fn();
  await act(async () => { render(<SeriesPage seriesId={12} onNavigate={onNavigate} isLoggedIn={false} />); });
  fireEvent.click(screen.getByTestId('series-follow'));
  expect(onNavigate).toHaveBeenCalledWith('PublicLogin');
  expect(localStorage.getItem('kentexa_after_login')).toBe('Series-12');
});

test('a series that is not published shows "haupatikani"', async () => {
  api.get.mockImplementation((url) => (url === '/series/12' ? Promise.reject({ response: { status: 404 } }) : Promise.resolve({ data: [] })));
  await act(async () => { render(<SeriesPage seriesId={12} onNavigate={jest.fn()} />); });
  expect(screen.getByTestId('series-missing')).toBeInTheDocument();
});

test('the bar on a post: which series, which part, previous and next', async () => {
  api.get.mockResolvedValue({ data: [{ id: 12, title: 'Business Conversations', number: 2, total: 3, prev: { postId: 7, number: 1, title: 'The Cashless Economy' }, next: { postId: 11, number: 3, title: 'Profit' } }] });
  const onNavigate = jest.fn();
  await act(async () => { render(<SeriesBar postId={9} onNavigate={onNavigate} />); });
  expect(api.get).toHaveBeenCalledWith('/series/for-post/9');
  expect(screen.getByTestId('series-bar')).toHaveTextContent('Sehemu 2 kati ya 3');
  fireEvent.click(screen.getByTestId('series-next'));
  expect(onNavigate).toHaveBeenCalledWith('PostDetail-11');
  fireEvent.click(screen.getByTestId('series-open-12'));
  expect(onNavigate).toHaveBeenCalledWith('Series-12');
});

test('a post that is in no series shows no bar', async () => {
  api.get.mockResolvedValue({ data: [] });
  await act(async () => { render(<SeriesBar postId={5} onNavigate={jest.fn()} />); });
  expect(screen.queryByTestId('series-bar')).toBeNull();
});

test('a topic page: its name, its series and its posts', async () => {
  api.get.mockImplementation((url) => Promise.resolve({ data:
    url === '/feed/topics' ? [{ key: 'biashara', label: 'Biashara', note: 'Bei, wateja, mbinu', following: false }]
      : url === '/series' ? [{ ...series, episodeList: undefined }]
        : { items: [{ id: 3, body: 'Habari za soko' }] } }));
  const onNavigate = jest.fn();
  await act(async () => { render(<TopicPage topicKey="biashara" onNavigate={onNavigate} />); });
  expect(screen.getByTestId('topic-title')).toHaveTextContent('Biashara');
  expect(api.get).toHaveBeenCalledWith('/feed', { params: { filter: 'for_you', topic: 'biashara', page: 1 } });
  expect(screen.getByTestId('post-3')).toBeInTheDocument();
  fireEvent.click(screen.getByTestId('series-card-12'));
  expect(onNavigate).toHaveBeenCalledWith('Series-12');
});

test('addresses: /series/<id> and /topic/<key> open their pages', () => {
  expect(pageToAddress('Series-12')).toBe('/series/12');
  expect(pathToPage('/series/12-business-conversations')).toBe('Series-12');
  expect(pageToAddress('Topic-biashara')).toBe('/topic/biashara');
  expect(pathToPage('/topic/biashara')).toBe('Topic-biashara');
});

test('Home tray and jumuiya: series cards open the series', async () => {
  const { SeriesTray } = require('../components/FeedTray');
  const onNavigate = jest.fn();
  render(<SeriesTray items={[{ id: 12, title: 'Business Conversations', episodes: 3, publisher: 'KenteXa', followers: 4 }]} onNavigate={onNavigate} />);
  expect(screen.getByTestId('tray-series')).toHaveTextContent('SEHEMU 3');
  fireEvent.click(screen.getByTestId('series-card-12'));
  expect(onNavigate).toHaveBeenCalledWith('Series-12');
});
