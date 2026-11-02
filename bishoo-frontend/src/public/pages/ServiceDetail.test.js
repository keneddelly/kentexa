import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ServiceDetail from './ServiceDetail';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key) => key }) }));
jest.mock('../components/ReputationBadge', () => () => null);
jest.mock('../components/WishlistHeart', () => () => null);
jest.mock('../components/CommerceCommentSection', () => () => null);

// B6D-P0 — display identity must always equal click-through identity: the
// name shown on the page and the commerceProfileId used to navigate must
// come from the SAME resolved actor (the backend's canonical resolver),
// never a raw provider.name paired with a mismatched/absent profile link.
describe('ServiceDetail — B6D-P0 display identity == click identity', () => {
  beforeEach(() => jest.clearAllMocks());

  test('Personal service (no commerceProfile from backend) shows and clicks through on the poster\'s own provider id, with no commerceProfileId param', async () => {
    const onNavigate = jest.fn();
    api.get.mockResolvedValue({
      data: {
        id: 1, title: 'Fundi wa Umeme', description: 'd', category: 'ufundi',
        priceType: 'per_job', price: 5000, coverageCity: 'Dar es Salaam',
        images: [], isAvailableNow: true, totalJobs: 0,
        provider: { id: 42, name: 'Kened', phone: '0700000001', reputationScore: 0 },
        commerceProfile: { id: 900, displayName: 'Kened', photoUrl: null },
      },
    });
    render(<ServiceDetail serviceId={1} onNavigate={onNavigate} isLoggedIn currentUser={{ id: 99 }} />);
    await waitFor(() => expect(screen.getByText('Kened')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Kened'));
    expect(onNavigate).toHaveBeenCalledWith('CommerceProfile-42', { commerceProfileId: 900 });
  });

  test('Business service shows and clicks through on the Business\'s own CommerceProfile id, never the raw poster\'s personal identity', async () => {
    const onNavigate = jest.fn();
    api.get.mockResolvedValue({
      data: {
        id: 2, title: 'CCTV Installation', description: 'd', category: 'ubunifu',
        priceType: 'per_job', price: 50000, coverageCity: 'Dar es Salaam',
        images: [], isAvailableNow: true, totalJobs: 0,
        provider: { id: 42, name: 'Kened', phone: '0700000001', reputationScore: 0 },
        commerceProfile: { id: 501, displayName: 'Bishoo Intelligence Systems', photoUrl: 'https://x/logo.png' },
      },
    });
    render(<ServiceDetail serviceId={2} onNavigate={onNavigate} isLoggedIn currentUser={{ id: 99 }} />);
    await waitFor(() => expect(screen.getByText('Bishoo Intelligence Systems')).toBeInTheDocument());

    // The raw personal name must never be the displayed identity here.
    expect(screen.queryByText('Kened')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Bishoo Intelligence Systems'));
    expect(onNavigate).toHaveBeenCalledWith('CommerceProfile-42', { commerceProfileId: 501 });
  });
});

describe('ServiceDetail — new look (owner 2026-11-02)', () => {
  beforeEach(() => jest.clearAllMocks());
  const ad = { id: 3, title: 'Fundi bomba', description: 'Narekebisha mabomba', priceType: 'per_job', price: 20000, coverageCity: 'Dar es Salaam',
    images: [], isAvailableNow: true, totalJobs: 0, views: 4, provider: { id: 42, name: 'Juma', phone: '0712000000' } };

  test('price as a number, request through the sheet with the same server call', async () => {
    api.get.mockResolvedValue({ data: ad });
    api.post.mockResolvedValue({ data: {} });
    render(<ServiceDetail serviceId={3} onNavigate={jest.fn()} isLoggedIn currentUser={{ id: 99 }} />);
    await waitFor(() => expect(screen.getByTestId('service-price')).toHaveTextContent('TZS 20,000'));
    expect(screen.queryByText(/service_detail.ratings_jobs/)).toBeNull(); // no rating shown without jobs
    fireEvent.click(screen.getByTestId('service-request'));
    fireEvent.click(screen.getByTestId('service-send'));
    expect(screen.getByRole('alert')).toHaveTextContent('service_detail.description_required');
    fireEvent.change(screen.getByTestId('service-need'), { target: { value: 'Bomba linavuja' } });
    fireEvent.change(screen.getByTestId('service-where'), { target: { value: 'Sinza' } });
    fireEvent.click(screen.getByTestId('service-send'));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/services/jobs/request', expect.objectContaining({ serviceAdId: 3, description: 'Bomba linavuja', jobLocation: 'Sinza' })));
    await screen.findByText('service_detail.request_sent_title');
  });

  test('a visitor is asked to log in; message opens the conversation about this service', async () => {
    api.get.mockResolvedValue({ data: ad });
    const onNavigate = jest.fn();
    render(<ServiceDetail serviceId={3} onNavigate={onNavigate} isLoggedIn={false} />);
    await waitFor(() => screen.getByTestId('service-request'));
    fireEvent.click(screen.getByTestId('service-request'));
    expect(onNavigate).toHaveBeenCalledWith('PublicLogin');
    fireEvent.click(screen.getByTestId('service-message'));
    expect(onNavigate).toHaveBeenCalledWith('MessageSeller-42', { contextType: 'service', contextId: 3 });
  });
});
