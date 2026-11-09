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

test('the welcome (owner approved 2026-11-02): town, 3 topics, communities in those topics, follow, first post', async () => {
  answers();
  api.post.mockImplementation(async (url) => ({ data: url.includes('/join') ? { id: 5, myStatus: 'active' } : url.includes('/follow') && url.startsWith('/profiles') ? { following: true } : {} }));
  api.patch.mockResolvedValue({ data: { id: 7, onboardingCompleted: true } });
  const onNavigate = jest.fn(); const onOpenMoment = jest.fn(); const onUserUpdated = jest.fn();
  await act(async () => { render(<Onboarding currentUser={{ id: 7, name: 'Juma Bakari' }} onNavigate={onNavigate} onOpenMoment={onOpenMoment} onUserUpdated={onUserUpdated} />); });
  fireEvent.click(screen.getByText('Dar es Salaam'));
  await next();
  expect(screen.getByTestId('welcome-next')).toBeDisabled();
  ['biashara', 'kilimo', 'usafiri'].forEach((k) => fireEvent.click(screen.getByTestId(`welcome-topic-${k}`)));
  await next();
  expect(api.post).toHaveBeenCalledWith('/feed/topics/follow', { keys: ['biashara', 'kilimo', 'usafiri'] });
  expect(localStorage.getItem('kentexa_topics_asked')).toBe('1');
  // "Unataka kufanya nini?" (owner 2026-11-09): several choices, saved when the welcome ends.
  expect(screen.getByTestId('welcome-goals')).toBeInTheDocument();
  fireEvent.click(screen.getByTestId('welcome-goal-sell'));
  fireEvent.click(screen.getByTestId('welcome-goal-office'));
  expect(screen.getByTestId('welcome-goal-sell')).toHaveAttribute('aria-pressed', 'true');
  await next();
  await screen.findByTestId('welcome-community-5');
  expect(screen.queryByTestId('welcome-community-6')).toBeNull(); // not in the chosen topics
  await act(async () => { fireEvent.click(screen.getByTestId('welcome-join-5')); });
  expect(api.post).toHaveBeenCalledWith('/communities/5/join');
  expect(screen.getByTestId('welcome-join-5')).toHaveTextContent('Umejiunga');
  await next();
  await screen.findByTestId('welcome-profile-26');
  expect(api.get).toHaveBeenCalledWith('/profiles/onboarding/suggestions', { params: { city: 'Dar es Salaam' } });
  await act(async () => { fireEvent.click(screen.getByTestId('welcome-follow-26')); });
  expect(api.post).toHaveBeenCalledWith('/profiles/26/follow');
  await next();
  await act(async () => { fireEvent.click(screen.getByTestId('welcome-post-hello')); });
  expect(api.patch).toHaveBeenCalledWith('/users/7', { onboardingCompleted: true, city: 'Dar es Salaam',
    onboardingState: expect.objectContaining({ goals: ['sell', 'office'], welcomedAt: expect.any(String) }) });
  expect(onUserUpdated).toHaveBeenCalledWith(expect.objectContaining({ onboardingCompleted: true }));
  expect(onOpenMoment).toHaveBeenCalledWith('moment', { kind: 'moment', text: 'Habari! Mimi ni Juma kutoka Dar es Salaam. Nimejiunga KenteXa leo.' });
});

test('no community in those topics: that step is skipped; "Baadaye" keeps the place the person was going', async () => {
  answers({ communities: [], profiles: [] });
  api.post.mockResolvedValue({ data: {} });
  api.patch.mockResolvedValue({ data: { id: 7, onboardingCompleted: true } });
  localStorage.setItem('kentexa_after_login', 'PostService');
  const onNavigate = jest.fn();
  await act(async () => { render(<Onboarding currentUser={{ id: 7, city: 'Arusha' }} onNavigate={onNavigate} />); });
  await next();
  ['biashara', 'kilimo', 'teknolojia'].forEach((k) => fireEvent.click(screen.getByTestId(`welcome-topic-${k}`)));
  await next();
  await next(); // goals: none chosen
  await screen.findByTestId('welcome-follow');
  expect(screen.getByTestId('welcome-follow')).toHaveTextContent('Bado hakuna wa kupendekeza Arusha');
  await next();
  await act(async () => { fireEvent.click(screen.getByTestId('welcome-later')); });
  await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('PostService'));
});

test('first post: product and service open their own forms', async () => {
  answers({ communities: [], profiles: [] });
  api.post.mockResolvedValue({ data: {} }); api.patch.mockResolvedValue({ data: {} });
  const onNavigate = jest.fn();
  await act(async () => { render(<Onboarding currentUser={{ id: 7 }} onNavigate={onNavigate} />); });
  fireEvent.click(screen.getByText('Ruka'));
  ['biashara', 'kilimo', 'usafiri'].forEach((k) => fireEvent.click(screen.getByTestId(`welcome-topic-${k}`)));
  await next(); await next(); await screen.findByTestId('welcome-follow'); await next();
  await act(async () => { fireEvent.click(screen.getByTestId('welcome-post-product')); });
  expect(onNavigate).toHaveBeenCalledWith('CreateClassified');
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
