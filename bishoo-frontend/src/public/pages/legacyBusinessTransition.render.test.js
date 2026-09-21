import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ConnectSelling from './ConnectSelling';
import CreateMomentModal from '../components/CreateMomentModal';
import api from '../../api/api';
import { presentationForRole } from '../../context/rolePresentation';

jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key, opts) => (opts && opts.name ? `${key}|${opts.name}` : key), i18n: { language: 'en' } }),
}));
jest.mock('../components/BackBar', () => () => null);

const bob = { id: 14, name: 'Bob', storeName: 'washing machine tz' };
const legacy = presentationForRole({ accountRoleId: 74, roleType: 'seller', userId: 14, profileId: 7, identityType: 'PERSONAL', displayName: 'Bob', businessId: null, commerceProfileId: 20 }, [], bob);
const business = presentationForRole({ accountRoleId: 90, roleType: 'seller', userId: 14, profileId: 21, identityType: 'BUSINESS', displayName: 'Washing Machine Tz', businessId: 4, commerceProfileId: 68 }, [], bob);

beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockResolvedValue({ data: [] });
});

describe('ConnectSelling (explicit, server-derived)', () => {
  test('lists only server options; an eligible Business opens ITS exact Start Selling; blocked ones cannot start', async () => {
    api.get.mockResolvedValue({
      data: {
        legacySeller: { accountRoleId: 74 },
        options: [
          { businessId: 4, businessName: 'Washing Machine Tz', sellingState: 'none', eligible: true, blocker: null },
          { businessId: 5, businessName: 'Two Profile Co', sellingState: 'none', eligible: false, blocker: 'BUSINESS_PROFILE_CARDINALITY_INVALID' },
          { businessId: 6, businessName: 'Already Selling', sellingState: 'active', eligible: false, blocker: 'SELLING_ALREADY_ACTIVE' },
        ],
      },
    });
    const onNavigate = jest.fn();
    render(<ConnectSelling onNavigate={onNavigate} isLoggedIn activeProfile={legacy} />);

    expect(await screen.findByText('Washing Machine Tz')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/business/selling-connection');
    expect(screen.getByText('connect_selling.intro|Bob')).toBeInTheDocument(); // legacy stays personal, explained

    const starts = screen.getAllByText('connect_selling.start');
    expect(starts).toHaveLength(1); // only the eligible Business can start
    fireEvent.click(starts[0]);
    expect(onNavigate).toHaveBeenCalledWith('BecomeBusinessCapability-4-commerce');
    expect(screen.getByText('connect_selling.blocker_BUSINESS_PROFILE_CARDINALITY_INVALID')).toBeInTheDocument();
    fireEvent.click(screen.getAllByText('connect_selling.open')[0]);
    expect(onNavigate).toHaveBeenLastCalledWith('BusinessHome-5');
  });

  test('a user with no Business sees the empty state and no Start button', async () => {
    api.get.mockResolvedValue({ data: { legacySeller: { accountRoleId: 74 }, options: [] } });
    render(<ConnectSelling onNavigate={jest.fn()} isLoggedIn activeProfile={legacy} />);
    expect(await screen.findByText('connect_selling.empty')).toBeInTheDocument();
    expect(screen.queryByText('connect_selling.start')).toBeNull();
  });
});

describe('CreateMomentModal (Posting as)', () => {
  const props = { onClose: jest.fn(), onPosted: jest.fn(), currentUser: bob, initialMode: 'selling' };

  test('Business context: "Posting as Washing Machine Tz · Business", posting enabled', async () => {
    render(<CreateMomentModal {...props} activeProfile={business} activeProfileId={68} />);
    expect(await screen.findByText('Washing Machine Tz')).toBeInTheDocument();
    expect(screen.getByText(/actor_label\.posting_as/)).toBeInTheDocument();
    expect(screen.getByText(/actor_label\.business/)).toBeInTheDocument();
    expect(screen.queryByText('actor_label.unresolved')).toBeNull();
  });

  test('legacy Seller: "Posting as Bob · Selling · Personal" — the store name never appears', async () => {
    render(<CreateMomentModal {...props} activeProfile={legacy} activeProfileId={20} />);
    expect(await screen.findByText('Bob')).toBeInTheDocument();
    expect(screen.getByText(/actor_label\.selling_personal/)).toBeInTheDocument();
    expect(screen.queryByText(/washing machine/i)).toBeNull();
  });

  test('no canonical actor: composer explains it and posting is blocked (nothing sent)', async () => {
    render(<CreateMomentModal {...props} activeProfile={legacy} activeProfileId={null} />);
    expect((await screen.findAllByText('actor_label.unresolved')).length).toBeGreaterThan(0);
    const post = screen.getByText(/create_moment_modal\.(share_moment_button|post_request_button)/);
    expect(post.closest('button')).toBeDisabled();
    await waitFor(() => expect(api.post).not.toHaveBeenCalled());
  });
});
