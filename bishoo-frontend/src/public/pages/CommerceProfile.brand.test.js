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
  const iMoments = labels.indexOf('Machapisho'); // owner 2026-11-02: Moments tab is now Machapisho
  expect(iMoments).toBeGreaterThan(-1);
  // New profiles part 2: Machapisho, Majibu, Jumuiya, then the person's listings.
  expect(labels.slice(iMoments + 1, iMoments + 4)).toEqual(['Majibu', 'Jumuiya', 'commerce_profile.tab_listings']);
  img.click();
  expect(onNavigate).toHaveBeenCalledWith('ClassifiedDetail-31');
});

test('new profiles: post count and the topics it talks about, from its real posts (owner approved 2026-11-02)', async () => {
  const p = { id: 74, ownerId: 46, type: 'personal', displayName: 'Neema', followersCount: 3, followingCount: 2 };
  api.get.mockImplementation(url => {
    if (url === '/profiles/for-user/46') return Promise.resolve({ data: [p] });
    if (url === '/profiles/74') return Promise.resolve({ data: p });
    if (url === '/feed/profile/74/summary') return Promise.resolve({ data: { postCount: 42, topics: ['biashara', 'mtaa'] } });
    return Promise.resolve({ data: [] });
  });
  render(<CommerceProfile pageParam="46" currentUser={{ id: 99 }} isLoggedIn onNavigate={jest.fn()} />);
  expect(await screen.findByTestId('profile-post-count')).toHaveTextContent('42 Machapisho');
  expect(screen.getByTestId('profile-topics')).toHaveTextContent('AnazungumziaBiasharaMtaa wako');
});

test('new profiles: the owner of a business is sent to Kazi; no Orders or Analytics tabs on the public page', async () => {
  const p = { id: 75, ownerId: 99, type: 'business', displayName: 'Bishoo Electronics', followersCount: 0, followingCount: 0 };
  serve(p);
  const onNavigate = jest.fn();
  render(<CommerceProfile pageParam="99" commerceProfileId={75} currentUser={{ id: 99 }} isLoggedIn onNavigate={onNavigate} />);
  const kazi = await screen.findByTestId('owner-kazi');
  expect(screen.queryByText('commerce_profile.tab_orders')).toBeNull();
  expect(screen.queryByText('commerce_profile.tab_analytics')).toBeNull();
  kazi.click();
  expect(onNavigate).toHaveBeenCalledWith('Workspace');
});

test('new profiles part 2: a person\'s replies (with the post they answer) and their open communities', async () => {
  const p = { id: 76, ownerId: 47, type: 'personal', displayName: 'Juma', followersCount: 0, followingCount: 0 };
  const onNavigate = jest.fn();
  api.get.mockImplementation((url, cfg) => {
    if (url === '/profiles/for-user/47') return Promise.resolve({ data: [p] });
    if (url === '/profiles/76') return Promise.resolve({ data: p });
    if (url === '/feed/profile/76/replies') return Promise.resolve({ data: [{ id: 5, body: 'WhatsApp status bado inaongoza', post: { id: 12, text: 'Mnapata wateja wapi?' } }] });
    if (url === '/communities' && cfg?.params?.profile === 76) return Promise.resolve({ data: [{ id: 3, name: 'Wafanyabiashara Kariakoo', topicKey: 'biashara', memberCount: 1240 }] });
    return Promise.resolve({ data: [] });
  });
  render(<CommerceProfile pageParam="47" currentUser={{ id: 99 }} isLoggedIn onNavigate={onNavigate} />);
  (await screen.findByText('Majibu')).click();
  const reply = await screen.findByTestId('reply-5');
  expect(reply).toHaveTextContent('Akijibu: Mnapata wateja wapi?');
  reply.click();
  expect(onNavigate).toHaveBeenCalledWith('PostDetail-12-comments');
  screen.getByText('Jumuiya').click();
  const c = await screen.findByTestId('profile-community-3');
  expect(c).toHaveTextContent('Wafanyabiashara Kariakoo');
  c.click();
  expect(onNavigate).toHaveBeenCalledWith('Community-3');
});
