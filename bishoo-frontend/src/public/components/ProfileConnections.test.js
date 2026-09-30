import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ProfileConnections from './ProfileConnections';
import api from '../../api/api';
jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
const mockT = key => key;
// A stable translator matches i18next and prevents test-only effect loops.
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockT }) }));
const profile = { id: 10, type: 'personal', displayName: 'Kened' };
const item = { profileId: 70, ownerId: 7, type: 'personal', displayName: 'Amina', isFollowing: false, isFollowedBy: true };
beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockResolvedValue({ data: { items: [item], hasMore: false } });
  api.post.mockResolvedValue({ data: { following: true } });
});
test('lists exact-profile followers and follows back through the same profile endpoint', async () => {
  const changed = jest.fn();
  render(<ProfileConnections profile={profile} kind="followers" isLoggedIn currentUser={{ id: 9 }} onNavigate={jest.fn()} onClose={jest.fn()} onChanged={changed} />);
  await screen.findByText('Amina');
  expect(api.get).toHaveBeenCalledWith('/profiles/10/followers', { params: { page: 1, limit: 20 } });
  fireEvent.click(screen.getByText('commerce_profile.follow_back_button'));
  await waitFor(() => expect(changed).toHaveBeenCalled());
  expect(api.post).toHaveBeenCalledWith('/profiles/70/follow');
  expect(screen.getByText('commerce_profile.unfollow_button')).toBeInTheDocument();
});
test('row navigation includes exact profile id, not just owner id', async () => {
  const navigate = jest.fn();
  render(<ProfileConnections profile={profile} kind="following" isLoggedIn onNavigate={navigate} onClose={jest.fn()} />);
  fireEvent.click(await screen.findByText('Amina'));
  expect(navigate).toHaveBeenCalledWith('CommerceProfile-7', { commerceProfileId: 70 });
});
test('commerce following is explicitly account-scoped; guests sign in before follow', async () => {
  const navigate = jest.fn();
  render(<ProfileConnections profile={{ ...profile, type: 'business' }} kind="following" onNavigate={navigate} onClose={jest.fn()} />);
  expect(screen.getByText('profile_connections.account_hint')).toBeInTheDocument();
  await screen.findByText('Amina');
  fireEvent.click(screen.getByText('commerce_profile.follow_back_button'));
  expect(navigate).toHaveBeenCalledWith('PublicLogin');
  expect(api.post).not.toHaveBeenCalled();
});
test('load errors are visible rather than a misleading empty list', async () => {
  api.get.mockRejectedValue(new Error('failed'));
  render(<ProfileConnections profile={profile} kind="followers" onNavigate={jest.fn()} onClose={jest.fn()} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('profile_connections.error');
});
