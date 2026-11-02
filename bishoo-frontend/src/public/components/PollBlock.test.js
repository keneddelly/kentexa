import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import PollBlock from './PollBlock';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ get: jest.fn(), post: jest.fn() }));

const closesAt = new Date(Date.now() + 2 * 24 * 3600 * 1000 + 60000).toISOString();
const before = { postId: 7, closesAt, closed: false, totalVotes: 4, myOptionId: null, showResults: false,
  options: [{ id: 11, label: 'Ndiyo' }, { id: 12, label: 'Hapana' }] };
const after = { ...before, totalVotes: 5, myOptionId: 12, showResults: true,
  options: [{ id: 11, label: 'Ndiyo', votes: 3, percent: 60 }, { id: 12, label: 'Hapana', votes: 2, percent: 40 }] };

beforeEach(() => { api.get.mockReset(); api.post.mockReset(); });
const open = async (props = {}) => {
  const onNavigate = jest.fn();
  await act(async () => { render(<PollBlock postId={7} isLoggedIn onNavigate={onNavigate} {...props} />); });
  return onNavigate;
};

test('before voting: the options and the total, no shares', async () => {
  api.get.mockResolvedValue({ data: before });
  await open();
  expect(api.get).toHaveBeenCalledWith('/feed/7/poll');
  expect(screen.getByTestId('poll-vote-11')).toHaveTextContent('Ndiyo');
  expect(screen.queryByText('60%')).toBeNull();
  expect(screen.getByTestId('poll-meta')).toHaveTextContent('Kura 4 · zimebaki siku 2');
});

test('a vote shows the server\'s results and marks the person\'s choice', async () => {
  api.get.mockResolvedValue({ data: before });
  api.post.mockResolvedValue({ data: after });
  await open();
  await act(async () => { fireEvent.click(screen.getByTestId('poll-vote-12')); });
  expect(api.post).toHaveBeenCalledWith('/feed/7/poll/vote', { optionId: 12 });
  expect(screen.getByTestId('poll-result-12')).toHaveTextContent('Hapana (wewe)40%');
  expect(screen.getByTestId('poll-result-11')).toHaveTextContent('60%');
});

test('someone not logged in is sent to log in, nothing is sent', async () => {
  api.get.mockResolvedValue({ data: before });
  const onNavigate = await open({ isLoggedIn: false });
  fireEvent.click(screen.getByTestId('poll-vote-11'));
  expect(onNavigate).toHaveBeenCalledWith('PublicLogin');
  expect(api.post).not.toHaveBeenCalled();
});

test('a refused vote says why', async () => {
  api.get.mockResolvedValue({ data: before });
  api.post.mockRejectedValue({ response: { data: { message: 'Kura imefungwa.' } } });
  await open();
  await act(async () => { fireEvent.click(screen.getByTestId('poll-vote-11')); });
  expect(screen.getByRole('alert')).toHaveTextContent('Kura imefungwa.');
});
