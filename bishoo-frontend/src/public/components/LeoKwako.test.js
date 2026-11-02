import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import LeoKwako from './LeoKwako';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ get: jest.fn() }));

test('shows today\'s items and opens each post (owner approved 2026-11-02)', async () => {
  api.get.mockResolvedValue({ data: [
    { kind: 'discussion', postId: 4, title: 'Bei ya mbolea Mwanza', count: 6 },
    { kind: 'replies', postId: 9, title: 'Taa mpya', count: 3 },
    { kind: 'poll', postId: 12, title: 'Mvua zimeanza?' },
  ] });
  const onNavigate = jest.fn();
  await act(async () => { render(<LeoKwako onNavigate={onNavigate} />); });
  expect(api.get).toHaveBeenCalledWith('/feed/today');
  expect(screen.getByTestId('leo-replies')).toHaveTextContent('Majibu 3 mapya kwenye chapisho lako');
  fireEvent.click(screen.getByTestId('leo-discussion'));
  expect(onNavigate).toHaveBeenCalledWith('PostDetail-4-comments');
  fireEvent.click(screen.getByTestId('leo-poll'));
  expect(onNavigate).toHaveBeenCalledWith('PostDetail-12');
});

test('nothing today, no block', async () => {
  api.get.mockResolvedValue({ data: [] });
  await act(async () => { render(<LeoKwako onNavigate={jest.fn()} />); });
  expect(screen.queryByTestId('leo-kwako')).toBeNull();
});

test('an unknown kind or a failed call shows nothing', async () => {
  api.get.mockResolvedValue({ data: [{ kind: 'ad', postId: 1, title: 'Nunua' }] });
  await act(async () => { render(<LeoKwako onNavigate={jest.fn()} />); });
  expect(screen.queryByTestId('leo-kwako')).toBeNull();
});
