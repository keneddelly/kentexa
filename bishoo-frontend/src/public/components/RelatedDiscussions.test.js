import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import RelatedDiscussions from './RelatedDiscussions';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ get: jest.fn() }));
jest.mock('./DiscussionCard', () => ({
  ThreadCard: () => null,
}));

beforeEach(() => api.get.mockReset());

test('a Google visitor always gets useful discovery destinations when no related results exist', async () => {
  api.get.mockResolvedValue({ data: { discussions: [], communities: [], businesses: [] } });
  const onNavigate = jest.fn();
  await act(async () => { render(<RelatedDiscussions postId={42} onNavigate={onNavigate} />); });

  expect(api.get).toHaveBeenCalledWith('/feed/42/related');
  expect(screen.getByTestId('discovery-fallback')).toHaveTextContent('Bado hatujapata mapendekezo');
  fireEvent.click(screen.getByTestId('discover-businesses'));
  expect(onNavigate).toHaveBeenCalledWith('Stores');
  fireEvent.click(screen.getByTestId('discover-communities'));
  expect(onNavigate).toHaveBeenCalledWith('JumuiyaHome');
});

test('discovery destinations remain visible if the related endpoint fails', async () => {
  api.get.mockRejectedValue(new Error('network unavailable'));
  await act(async () => { render(<RelatedDiscussions postId={43} onNavigate={jest.fn()} />); });
  expect(screen.getByTestId('discovery-fallback')).toHaveTextContent('Bado hatujapata mapendekezo');
  expect(screen.getByTestId('discover-home')).toBeInTheDocument();
});

test('matching recommendations are shown alongside the always-available discovery destinations', async () => {
  api.get.mockResolvedValue({ data: { businesses: [{ id: 9, displayName: 'BIS', ownerId: 4, category: 'Usalama' }] } });
  await act(async () => { render(<RelatedDiscussions postId={44} onNavigate={jest.fn()} />); });
  expect(screen.getByTestId('related-business-9')).toHaveTextContent('BIS');
  expect(screen.getByTestId('discovery-fallback')).toHaveTextContent('Chunguza biashara');
});
