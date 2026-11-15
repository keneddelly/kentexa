import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import TagPage from './TagPage';
import HashtagText from '../components/HashtagText';
import HashtagSuggestions from '../components/HashtagSuggestions';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ get: jest.fn(), post: jest.fn() }));
jest.mock('./HomeFeed', () => ({
  PostCard: ({ post }) => <div data-testid="post-card">{post.title}</div>,
}));

afterEach(() => jest.clearAllMocks());

const answer = (info, posts) => (url, opts) => {
  if (url.endsWith('/posts')) return Promise.resolve({ data: posts(opts?.params) });
  return Promise.resolve({ data: info });
};

test('shows the tag, its post count and its posts; Mpya asks for the newest', async () => {
  api.get.mockImplementation(answer(
    { key: 'mitumba', display: 'Mitumba', blocked: false, postCount: 2 },
    (p) => ({ items: [{ id: 1, title: p.sort === 'latest' ? 'Mpya kabisa' : 'Maarufu' }], total: 1 }),
  ));
  render(<TagPage tagKey="mitumba" onNavigate={jest.fn()} isLoggedIn={false} />);
  expect(await screen.findByText('Maarufu')).toBeInTheDocument();
  expect(screen.getByTestId('tag-title')).toHaveTextContent('#Mitumba');
  expect(screen.getByTestId('tag-count')).toHaveTextContent('Machapisho 2');
  expect(api.get).toHaveBeenCalledWith('/hashtags/mitumba/posts', { params: { sort: 'top', page: 1 } });

  fireEvent.click(screen.getByRole('tab', { name: 'Mpya' }));
  expect(await screen.findByText('Mpya kabisa')).toBeInTheDocument();
  expect(api.get).toHaveBeenCalledWith('/hashtags/mitumba/posts', { params: { sort: 'latest', page: 1 } });
});

test('a tag with no posts says so', async () => {
  api.get.mockImplementation(answer({ key: 'mpya', display: 'Mpya', blocked: false, postCount: 0 }, () => ({ items: [], total: 0 })));
  render(<TagPage tagKey="mpya" onNavigate={jest.fn()} />);
  expect(await screen.findByTestId('tag-empty')).toHaveTextContent('Bado hakuna chapisho lenye #Mpya.');
});

test('a blocked tag shows nothing', async () => {
  api.get.mockImplementation(answer({ key: 'mbaya', display: 'Mbaya', blocked: true, postCount: 0 }, () => ({ items: [{ id: 9, title: 'x' }], total: 1 })));
  render(<TagPage tagKey="mbaya" onNavigate={jest.fn()} />);
  expect(await screen.findByTestId('tag-unavailable')).toHaveTextContent('Tagi hii haipatikani');
  expect(screen.queryByTestId('post-card')).toBeNull();
});

test('tags in a text are links that open the tag page, not the post', () => {
  const onTag = jest.fn();
  const onPost = jest.fn();
  render(<div onClick={onPost}><HashtagText text="Bei nzuri #Mitumba leo" onTag={onTag} /></div>);
  const link = screen.getByTestId('hashtag');
  expect(link).toHaveTextContent('#Mitumba');
  expect(link).toHaveAttribute('href', '/tag/mitumba');
  fireEvent.click(link);
  expect(onTag).toHaveBeenCalledWith('mitumba');
  expect(onPost).not.toHaveBeenCalled();
});

test('the composer offers used tags with their post counts and finishes the tag', async () => {
  jest.useFakeTimers();
  api.get.mockResolvedValue({ data: [{ key: 'mitumba', display: 'Mitumba', postCount: 12 }] });
  const onPick = jest.fn();
  render(<HashtagSuggestions text="Nauza #mit" caret={10} onPick={onPick} />);
  jest.advanceTimersByTime(250);
  jest.useRealTimers();
  const option = await screen.findByTestId('hashtag-suggestion');
  expect(option).toHaveTextContent('#Mitumba');
  expect(option).toHaveTextContent('Machapisho 12');
  expect(api.get).toHaveBeenCalledWith('/hashtags/suggest', { params: { q: 'mit' } });
  fireEvent.click(option);
  expect(onPick).toHaveBeenCalledWith('Nauza #Mitumba ', 15);
});

test('the composer says when more than 5 tags were written', () => {
  render(<HashtagSuggestions text="#a1 #b2 #c3 #d4 #e5 #f6 ok" caret={26} onPick={jest.fn()} />);
  expect(screen.getByTestId('hashtag-limit')).toHaveTextContent('Tagi 5 za kwanza tu ndizo zitaunganishwa.');
});

test('no suggestions while no tag is being typed', async () => {
  render(<HashtagSuggestions text="Habari za leo" caret={13} onPick={jest.fn()} />);
  await waitFor(() => expect(api.get).not.toHaveBeenCalled());
  expect(screen.queryByTestId('hashtag-suggestions')).toBeNull();
});
