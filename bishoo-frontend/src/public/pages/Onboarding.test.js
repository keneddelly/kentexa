import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Onboarding from './Onboarding';
import NewcomerNudge from '../components/NewcomerNudge';
import api from '../../api/api';
import { firstPostStart } from '../../utils/firstPost';

jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), patch: jest.fn() } }));
beforeEach(() => { jest.clearAllMocks(); localStorage.clear(); });

const TOPICS = ['biashara', 'kilimo', 'usafiri', 'teknolojia'].map((key) => ({ key, label: key, following: false }));
const answers = (over = {}) => api.get.mockImplementation(async (url) => {
  if (url === '/feed/topics') return { data: TOPICS };
  if (url === '/communities') return { data: over.communities ?? [{ id: 5, name: 'Wafanyabiashara Dar', topicKey: 'biashara', memberCount: 1240, myStatus: null }, { id: 6, name: 'Michezo', topicKey: 'michezo', memberCount: 9, myStatus: null }] };
  if (url === '/profiles/onboarding/suggestions') return { data: over.profiles ?? [{ id: 26, displayName: 'BiS', location: 'Kariakoo', isLocalSuggestion: true }] };
  return { data: {} };
});
const next = async () => { await act(async () => { fireEvent.click(screen.getByTestId('welcome-next')); }); };

test('the new welcome (owner 2026-11-10): goal first, town and topics on one screen, then communities and people for a buyer', async () => {
  answers();
  api.post.mockImplementation(async (url) => ({ data: url.includes('/join') ? { id: 5, myStatus: 'active' } : url.includes('/follow') && url.startsWith('/profiles') ? { following: true } : {} }));
  api.patch.mockResolvedValue({ data: { id: 7, onboardingCompleted: true } });
  const onNavigate = jest.fn(); const onUserUpdated = jest.fn();
  await act(async () => { render(<Onboarding currentUser={{ id: 7, name: 'Juma Bakari' }} onNavigate={onNavigate} onUserUpdated={onUserUpdated} />); });
  expect(screen.getByTestId('welcome-goal')).toHaveTextContent('Unataka kufanya nini KenteXa?');
  // Uza tena comes first in the list.
  expect(screen.getAllByRole('radio')[0]).toHaveAttribute('data-testid', 'welcome-goal-resell');
  fireEvent.click(screen.getByTestId('welcome-goal-buy'));
  await next();
  expect(screen.getByTestId('welcome-place')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Dar es Salaam'));
  fireEvent.click(screen.getByTestId('welcome-topic-biashara'));
  expect(screen.getByTestId('welcome-next')).toBeDisabled(); // 1 topic: needs 3, or none
  ['kilimo', 'usafiri'].forEach((k) => fireEvent.click(screen.getByTestId(`welcome-topic-${k}`)));
  await next();
  expect(api.post).toHaveBeenCalledWith('/feed/topics/follow', { keys: ['biashara', 'kilimo', 'usafiri'] });
  await screen.findByTestId('welcome-community-5');
  expect(screen.queryByTestId('welcome-community-6')).toBeNull(); // not in the chosen topics
  expect(screen.getByTestId('welcome-profile-26')).toBeInTheDocument();
  expect(api.get).toHaveBeenCalledWith('/profiles/onboarding/suggestions', { params: { city: 'Dar es Salaam' } });
  await act(async () => { fireEvent.click(screen.getByTestId('welcome-join-5')); });
  expect(screen.getByTestId('welcome-join-5')).toHaveTextContent('Umejiunga');
  await act(async () => { fireEvent.click(screen.getByTestId('welcome-follow-26')); });
  expect(api.post).toHaveBeenCalledWith('/profiles/26/follow');
  await act(async () => { fireEvent.click(screen.getByTestId('welcome-finish')); });
  expect(api.patch).toHaveBeenCalledWith('/users/7', { onboardingCompleted: true, city: 'Dar es Salaam',
    onboardingState: expect.objectContaining({ goals: ['buy'], welcomedAt: expect.any(String) }) });
  expect(onUserUpdated).toHaveBeenCalledWith(expect.objectContaining({ onboardingCompleted: true }));
  expect(onNavigate).toHaveBeenCalledWith('Home');
});

test('Uza tena: join with the rules, see products to resell, then my offers', async () => {
  api.get.mockImplementation(async (url) => {
    if (url === '/feed/topics') return { data: TOPICS };
    if (url === '/resale/membership') return { data: { member: false } };
    if (url === '/resale/products') return { data: { items: [{ id: 3, name: 'Simu', image: null, supplierName: 'BIS', publicPrice: 50000, supplierPrice: 42000, floor: 42000, profitAtShopPrice: 8000, stock: 4 }], categories: [], hasMore: false } };
    return { data: [] };
  });
  api.post.mockImplementation(async (url) => ({ data: url === '/resale/join' ? { member: true } : {} }));
  api.patch.mockResolvedValue({ data: {} });
  const onNavigate = jest.fn();
  await act(async () => { render(<Onboarding currentUser={{ id: 7 }} onNavigate={onNavigate} />); });
  fireEvent.click(screen.getByTestId('welcome-goal-resell'));
  await next();
  await act(async () => { fireEvent.click(screen.getByText('Ruka')); });
  fireEvent.click(await screen.findByTestId('resale-rules'));
  await act(async () => { fireEvent.click(screen.getByTestId('resale-join-btn')); });
  expect(api.post).toHaveBeenCalledWith('/resale/join', { acceptRules: true });
  expect(await screen.findByTestId('catalogue-3')).toHaveTextContent('Faida TZS 8,000');
  await act(async () => { fireEvent.click(screen.getByTestId('welcome-finish')); });
  expect(api.patch).toHaveBeenCalledWith('/users/7', expect.objectContaining({ onboardingState: expect.objectContaining({ goals: ['resell'] }) }));
  expect(onNavigate).toHaveBeenCalledWith('MyResales', { tab: 'mine' });
});

test('a seller goes straight to the short shop form; "Baadaye" goes Home', async () => {
  answers();
  api.post.mockResolvedValue({ data: {} }); api.patch.mockResolvedValue({ data: {} });
  const onNavigate = jest.fn();
  await act(async () => { render(<Onboarding currentUser={{ id: 7 }} onNavigate={onNavigate} />); });
  fireEvent.click(screen.getByTestId('welcome-goal-sell'));
  await next();
  await act(async () => { fireEvent.click(screen.getByText('Ruka')); });
  await act(async () => { fireEvent.click(screen.getByTestId('welcome-finish')); });
  expect(onNavigate).toHaveBeenCalledWith('BecomeSeller');
});

test('signed up from a link: the goal only, then straight back to the product', async () => {
  answers();
  api.patch.mockResolvedValue({ data: {} });
  localStorage.setItem('kentexa_after_login', 'ProductDetail-3');
  const onNavigate = jest.fn();
  await act(async () => { render(<Onboarding currentUser={{ id: 7 }} onNavigate={onNavigate} />); });
  expect(screen.queryByLabelText(/Hatua 1 kati ya/)).toBeNull();
  fireEvent.click(screen.getByTestId('welcome-goal-buy'));
  await next();
  await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('ProductDetail-3'));
  expect(api.patch).toHaveBeenCalledWith('/users/7', expect.objectContaining({ onboardingCompleted: true }));
  expect(localStorage.getItem('kentexa_after_login')).toBeNull();
});

test('Home keeps asking: photo first, then the first post; "Baadaye" hides it for a day', async () => {
  api.get.mockResolvedValue({ data: { postCount: 0 } });
  const onOpenMoment = jest.fn(); const onNavigate = jest.fn();
  const { rerender } = await (async () => { let r; await act(async () => { r = render(<NewcomerNudge currentUser={{ id: 7, name: 'Asha' }} activeProfileId={40} onNavigate={onNavigate} onOpenMoment={onOpenMoment} />); }); return r; })();
  expect(api.get).toHaveBeenCalledWith('/feed/profile/40/summary');
  fireEvent.click(screen.getByTestId('nudge-go'));
  expect(onNavigate).toHaveBeenCalledWith('AddProfilePhoto');
  fireEvent.click(screen.getByTestId('nudge-later'));
  expect(screen.getByTestId('nudge-post')).toBeInTheDocument();
  fireEvent.click(screen.getByTestId('nudge-go'));
  expect(onOpenMoment).toHaveBeenCalledWith('moment', { kind: 'moment', text: firstPostStart({ name: 'Asha' }, undefined) });
  await act(async () => { rerender(<NewcomerNudge currentUser={{ id: 7, avatarUrl: 'a.jpg' }} activeProfileId={40} onNavigate={onNavigate} onOpenMoment={onOpenMoment} refreshKey={1} />); });
  api.get.mockResolvedValue({ data: { postCount: 3 } });
  await act(async () => { rerender(<NewcomerNudge currentUser={{ id: 7, avatarUrl: 'a.jpg' }} activeProfileId={40} onNavigate={onNavigate} onOpenMoment={onOpenMoment} refreshKey={2} />); });
  expect(screen.queryByTestId('nudge-post')).toBeNull();
});

test('people who joined before the new welcome are invited to it once from Home', async () => {
  api.get.mockResolvedValue({ data: { postCount: 3 } });
  const onNavigate = jest.fn();
  localStorage.removeItem('kentexa_nudge_welcome_8');
  const { rerender } = await (async () => { let r; await act(async () => { r = render(<NewcomerNudge currentUser={{ id: 8, name: 'Old', avatarUrl: 'x', onboardingCompleted: true }} activeProfileId={41} onNavigate={onNavigate} />); }); return r; })();
  fireEvent.click(screen.getByTestId('nudge-go'));
  expect(onNavigate).toHaveBeenCalledWith('Onboarding');
  rerender(<NewcomerNudge currentUser={{ id: 8, name: 'Old', avatarUrl: 'x', onboardingCompleted: true, onboardingState: { welcomedAt: '2026-11-09' } }} activeProfileId={41} onNavigate={onNavigate} />);
  expect(screen.queryByTestId('nudge-welcome')).toBeNull();
});
