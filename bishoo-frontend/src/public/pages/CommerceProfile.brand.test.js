import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import CommerceProfile from './CommerceProfile';
import api from '../../api/api';
jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), defaults: { baseURL: '' } } }));
const mockT = key => key;
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockT }) }));

const serve = (p) => api.get.mockImplementation(url => {
  if (url === `/profiles/for-user/${p.ownerId}`) return Promise.resolve({ data: [p] });
  if (url === `/profiles/${p.id}`) return Promise.resolve({ data: p });
  return Promise.resolve({ data: [] });
});

test('brand header: what the identity is, verified, and a trust card from recorded numbers only', async () => {
  serve({ id: 71, ownerId: 43, type: 'hub', displayName: 'Geita Express', username: 'geitaexpress', category: 'Usafirishaji',
    isVerified: true, rating: 4.6, reviewsCount: 58, followersCount: 10, followingCount: 1, createdAt: '2025-03-04T00:00:00Z' });
  render(<CommerceProfile pageParam="43" currentUser={{ id: 99 }} isLoggedIn onNavigate={jest.fn()} />);
  const card = await screen.findByTestId('trust-card');
  expect(screen.getAllByText('Geita Express').length).toBeGreaterThan(0);
  expect(screen.getByText('Ofisi ya usafirishaji')).toBeInTheDocument();
  expect(screen.getByText('@geitaexpress · Usafirishaji')).toBeInTheDocument();
  expect(within(card).getByText('4.6')).toBeInTheDocument();
  expect(within(card).getByText('Maoni 58')).toBeInTheDocument();
  expect(within(card).getByText('Imethibitishwa na KenteXa')).toBeInTheDocument();
  expect(within(card).queryByText('Oda zilizokamilika')).toBeNull();   // not a seller: no sales number
});

test('no reviews yet: no made-up rating', async () => {
  serve({ id: 72, ownerId: 44, type: 'personal', displayName: 'Asha', followersCount: 0, followingCount: 0 });
  render(<CommerceProfile pageParam="44" currentUser={{ id: 99 }} isLoggedIn onNavigate={jest.fn()} />);
  const card = await screen.findByTestId('trust-card');
  await waitFor(() => expect(within(card).queryByText('0.0')).toBeNull());
  expect(within(card).queryByText(/^Maoni/)).toBeNull();
});

test('personal profile: visitors see the Listings tab right after Moments; a listing Moment picture opens the listing', async () => {
  const p = { id: 73, ownerId: 45, type: 'personal', displayName: 'Kisayo Store', followersCount: 0, followingCount: 2 };
  const onNavigate = jest.fn();
  api.get.mockImplementation(url => {
    if (url === '/profiles/for-user/45') return Promise.resolve({ data: [p] });
    if (url === '/profiles/73') return Promise.resolve({ data: p });
    if (url.startsWith('/feed/business/')) return Promise.resolve({ data: [
      { id: 9, title: 'Linen material', body: 'Linen material', imageUrl: 'x.jpg', linkedEntityType: 'classified', linkedEntityId: 31, createdAt: new Date().toISOString() },
    ] });
    return Promise.resolve({ data: [] });
  });
  render(<CommerceProfile pageParam="45" currentUser={{ id: 99 }} isLoggedIn onNavigate={onNavigate} />);
  const img = await screen.findByTestId('moment-image');
  const labels = screen.getAllByRole('button').map(b => b.textContent);
  const iMoments = labels.indexOf('Moments');
  expect(iMoments).toBeGreaterThan(-1);
  expect(labels[iMoments + 1]).toBe('commerce_profile.tab_listings');
  img.click();
  expect(onNavigate).toHaveBeenCalledWith('ClassifiedDetail-31');
});
