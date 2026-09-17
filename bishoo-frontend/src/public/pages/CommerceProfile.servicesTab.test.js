import React from 'react';
import { render, waitFor } from '@testing-library/react';
import CommerceProfile from './CommerceProfile';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key) => key }) }));

// B6D-P0 — the Services tab on a Business/Service-Provider/Agent
// CommerceProfile must be scoped to THAT exact profile (for-profile/:id),
// never the raw owner id (provider/:id), which mixed every business +
// personal service the same human runs into one list.
describe('CommerceProfile — Services tab uses the scoped endpoint, B6D-P0', () => {
  beforeEach(() => jest.clearAllMocks());

  test('fetches /services/for-profile/:commerceProfileId, never /services/provider/:ownerId', async () => {
    const businessProfile = {
      id: 501, ownerId: 42, type: 'business', displayName: 'Bishoo Intelligence Systems',
      username: 'bis', photoUrl: null, followersCount: 0, rating: 0,
    };
    api.get.mockImplementation((url) => {
      if (url === '/profiles/501') return Promise.resolve({ data: businessProfile });
      if (url.startsWith('/services/for-profile/')) return Promise.resolve({ data: [] });
      return Promise.resolve({ data: [] });
    });

    render(
      <CommerceProfile
        pageParam="42"
        commerceProfileId={501}
        onNavigate={jest.fn()}
        isLoggedIn
        currentUser={{ id: 99 }}
      />,
    );

    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith('/services/for-profile/501'),
    );

    const calledProviderRoute = api.get.mock.calls.some(([url]) => url.startsWith('/services/provider/'));
    expect(calledProviderRoute).toBe(false);
  });
});
