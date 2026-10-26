import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import api from '../../api/api';
import WhoToFollow from './WhoToFollow';

jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));

test('shows identities of every kind and follows one', async () => {
  api.get.mockResolvedValue({ data: [
    { id: 5, ownerId: 50, displayName: 'Samatta Transportation', type: 'hub', location: 'Kariakoo', isVerified: true },
    { id: 6, ownerId: 60, displayName: 'Kisayo Store', type: 'personal', category: 'Nguo', location: 'Dar es Salaam' },
  ] });
  api.post.mockResolvedValue({ data: { following: true } });
  render(<WhoToFollow isLoggedIn onNavigate={jest.fn()} city="Dar es Salaam" />);
  expect(await screen.findByText('Samatta Transportation')).toBeInTheDocument();
  expect(screen.getByText('Ofisi ya usafirishaji · Kariakoo')).toBeInTheDocument();
  expect(screen.getByText('Nguo · Dar es Salaam')).toBeInTheDocument();
  expect(api.get).toHaveBeenCalledWith('/profiles/suggestions', { params: { limit: 3, city: 'Dar es Salaam' } });
  fireEvent.click(screen.getAllByText('Fuata')[0]);
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/profiles/5/follow'));
  expect(await screen.findByText('Unafuata')).toBeInTheDocument();
});

test('nothing to suggest: nothing shown', async () => {
  api.get.mockResolvedValue({ data: [] });
  const { container } = render(<WhoToFollow isLoggedIn onNavigate={jest.fn()} />);
  await waitFor(() => expect(api.get).toHaveBeenCalled());
  expect(container.firstChild).toBeNull();
});
