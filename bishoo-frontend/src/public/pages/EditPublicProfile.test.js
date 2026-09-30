import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import EditPublicProfile from './EditPublicProfile';
import api from '../../api/api';
jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn(), patch: jest.fn() } }));
const mockT = key => key;
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockT }) }));
jest.mock('../components/BackBar', () => () => null);
beforeEach(() => jest.clearAllMocks());
test('business public edits save to the requested profile without changing its owner account', async () => {
  api.get.mockResolvedValue({ data: { id: 26, ownerId: 7, type: 'business', displayName: 'BiS', username: 'bishoo' } });
  api.patch.mockResolvedValue({ data: {} });
  const navigate = jest.fn();
  render(<EditPublicProfile commerceProfileId={26} currentUser={{ id: 7 }} onNavigate={navigate} />);
  const bio = await screen.findByLabelText('profile_editor.bio');
  fireEvent.change(bio, { target: { value: 'Security systems' } });
  fireEvent.click(screen.getByText('profile.update'));
  await waitFor(() => expect(navigate).toHaveBeenCalledWith('CommerceProfile-7', { commerceProfileId: 26 }));
  expect(api.patch).toHaveBeenCalledWith('/profiles/26', expect.objectContaining({ bio: 'Security systems' }));
  expect(api.patch.mock.calls.every(([path]) => !path.startsWith('/users/'))).toBe(true);
});
test('another account cannot open an editable form', async () => {
  api.get.mockResolvedValue({ data: { id: 26, ownerId: 8 } });
  render(<EditPublicProfile commerceProfileId={26} currentUser={{ id: 7 }} onNavigate={jest.fn()} />);
  await screen.findByText('profile_editor.not_owner');
  expect(screen.queryByText('profile.update')).not.toBeInTheDocument();
});
