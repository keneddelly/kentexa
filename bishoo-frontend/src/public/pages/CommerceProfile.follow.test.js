import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import CommerceProfile from './CommerceProfile';
import api from '../../api/api';
jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
const mockT = key => key;
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockT }) }));
test('bare-user profile resolves social details, shows Following and opens exact-profile followers', async () => {
  const p = { id: 70, ownerId: 42, type: 'personal', displayName: 'Kened', followersCount: 2, followingCount: 3, isFollowing: true };
  api.get.mockImplementation(url => {
    if (url === '/profiles/for-user/42') return Promise.resolve({ data: [{ ...p, isFollowing: undefined }] });
    if (url === '/profiles/70') return Promise.resolve({ data: p });
    if (url === '/profiles/70/followers') return Promise.resolve({ data: { items: [], hasMore: false } });
    return Promise.resolve({ data: [] });
  });
  render(<CommerceProfile pageParam="42" currentUser={{ id: 99 }} isLoggedIn onNavigate={jest.fn()} />);
  await waitFor(() => expect(screen.getByRole('button', { name: /profile_connections.following/ })).toBeInTheDocument());
  expect(api.get).toHaveBeenCalledWith('/profiles/70');
  expect(screen.getByRole('button', { name: /profile_connections.following/ })).toHaveTextContent('3');
  expect(screen.getByText('commerce_profile.unfollow_button')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /commerce_profile.stat_followers/ }));
  await waitFor(() => expect(api.get).toHaveBeenCalledWith('/profiles/70/followers', { params: { page: 1, limit: 20 } }));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});
