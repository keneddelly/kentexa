import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Onboarding from './Onboarding';
import api from '../../api/api';
jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), patch: jest.fn() } }));
const mockT = key => key;
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockT }) }));
beforeEach(() => { jest.clearAllMocks(); localStorage.clear(); });
test('loads curated suggestions for the selected city and follows exact profiles', async () => {
  api.get.mockResolvedValue({ data: [
    { id: 2, displayName: 'Kentexa', isOfficialPlatformProfile: true },
    { id: 26, displayName: 'BiS' },
    { id: 40, displayName: 'Local business', isLocalSuggestion: true },
  ] });
  api.post.mockResolvedValue({ data: { following: true } });
  render(<Onboarding currentUser={{ id: 7 }} onNavigate={jest.fn()} />);
  fireEvent.click(screen.getByText('Dar es Salaam'));
  fireEvent.click(screen.getByText('onboarding.continue_button'));
  await screen.findByText('Local business');
  expect(api.get).toHaveBeenCalledWith('/profiles/onboarding/suggestions', { params: { city: 'Dar es Salaam' } });
  fireEvent.click(screen.getAllByText('onboarding.follow_button')[1]);
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/profiles/26/follow'));
});
test('following is optional and completion preserves the original posting destination', async () => {
  api.get.mockResolvedValue({ data: [] });
  api.patch.mockResolvedValue({ data: { id: 7, onboardingCompleted: true } });
  localStorage.setItem('kentexa_after_login', 'PostService');
  const navigate = jest.fn(); const updated = jest.fn();
  render(<Onboarding currentUser={{ id: 7, city: 'Arusha' }} onNavigate={navigate} onUserUpdated={updated} />);
  fireEvent.click(screen.getByText('onboarding.continue_button'));
  await screen.findByText('onboarding.no_local_business');
  fireEvent.click(screen.getByText('onboarding.finish_button'));
  await waitFor(() => expect(navigate).toHaveBeenCalledWith('PostService'));
  expect(api.post).not.toHaveBeenCalled();
  expect(updated).toHaveBeenCalledWith(expect.objectContaining({ onboardingCompleted: true }));
});
