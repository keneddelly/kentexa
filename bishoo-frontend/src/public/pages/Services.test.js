import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import Services from './Services';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key) => key }) }));

// B6D-P0 — a browse card must show the actual actor the ad resolves to
// (Business name for a Business-attributed ad, personal name otherwise),
// never a bare provider.name regardless of which identity actually posted it.
describe('Services (browse) — card identity, B6D-P0', () => {
  beforeEach(() => jest.clearAllMocks());

  test('Personal-scoped ad (no commerceProfile) shows the poster\'s own name', async () => {
    api.get.mockResolvedValue({
      data: {
        ads: [{
          id: 1, title: 'Fundi wa Umeme', description: 'd', category: 'ufundi',
          priceType: 'per_job', price: 5000, coverageCity: 'Dar es Salaam', images: [],
          provider: { id: 42, name: 'Kened', phone: '0700000001', reputationScore: 0 },
          commerceProfile: null,
        }],
        total: 1,
      },
    });
    render(<Services onNavigate={jest.fn()} isLoggedIn />);
    await waitFor(() => expect(screen.getByText('Kened')).toBeInTheDocument());
  });

  test('Business-attributed ad shows the Business\'s own CommerceProfile displayName, not the raw poster name', async () => {
    api.get.mockResolvedValue({
      data: {
        ads: [{
          id: 2, title: 'CCTV Installation', description: 'd', category: 'ubunifu',
          priceType: 'per_job', price: 50000, coverageCity: 'Dar es Salaam', images: [],
          provider: { id: 42, name: 'Kened', phone: '0700000001', reputationScore: 0 },
          commerceProfile: { id: 501, displayName: 'Bishoo Intelligence Systems', photoUrl: null },
        }],
        total: 1,
      },
    });
    render(<Services onNavigate={jest.fn()} isLoggedIn />);
    await waitFor(() => expect(screen.getByText('Bishoo Intelligence Systems')).toBeInTheDocument());
    expect(screen.queryByText('Kened')).not.toBeInTheDocument();
  });
});
