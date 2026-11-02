import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AddProfilePhoto from './AddProfilePhoto';
import api from '../../api/api';
import { photoSkipped } from '../../utils/photoLater';
jest.mock('../../api/api', () => ({ __esModule: true, default: { post: jest.fn(), patch: jest.fn() } }));
const mockT = key => key;
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockT, i18n: { language: 'sw' } }) }));
jest.mock('../components/LanguageSwitcher', () => () => null);
beforeEach(() => { jest.clearAllMocks(); localStorage.clear(); });
const pick = (container) => fireEvent.change(container.querySelector('input[type="file"]'), { target: { files: [new File(['photo'], 'photo.jpg', { type: 'image/jpeg' })] } });

test('cannot continue before a photo is uploaded', () => {
  render(<AddProfilePhoto currentUser={{ id: 7 }} onNavigate={jest.fn()} />);
  expect(screen.getByTestId('photo-save')).toBeDisabled();
});
test('saves personal photo, refreshes account state and preserves the posting destination', async () => {
  api.post.mockResolvedValue({ data: { urls: ['photo.jpg'] } });
  api.patch.mockResolvedValue({ data: { id: 7, avatarUrl: 'photo.jpg', onboardingCompleted: true } });
  localStorage.setItem('kentexa_after_login', 'CreateClassified');
  const navigate = jest.fn(); const updated = jest.fn();
  const { container } = render(<AddProfilePhoto currentUser={{ id: 7, onboardingCompleted: true }} onNavigate={navigate} onUserUpdated={updated} />);
  pick(container);
  await waitFor(() => expect(screen.getByTestId('photo-save')).toBeEnabled());
  fireEvent.click(screen.getByTestId('photo-save'));
  await waitFor(() => expect(navigate).toHaveBeenCalledWith('CreateClassified'));
  expect(api.patch).toHaveBeenCalledWith('/users/7', { avatarUrl: 'photo.jpg' });
  expect(updated).toHaveBeenCalledWith(expect.objectContaining({ avatarUrl: 'photo.jpg', onboardingCompleted: true }));
});
test('failed photo save keeps the user on the photo step and allows retry', async () => {
  api.post.mockResolvedValue({ data: { urls: ['photo.jpg'] } });
  api.patch.mockRejectedValue(new Error('offline'));
  const navigate = jest.fn();
  const { container } = render(<AddProfilePhoto currentUser={{ id: 7 }} onNavigate={navigate} />);
  pick(container);
  await waitFor(() => expect(screen.getByTestId('photo-save')).toBeEnabled());
  fireEvent.click(screen.getByTestId('photo-save'));
  await screen.findByText('signin.photo_failed');
  expect(navigate).not.toHaveBeenCalled();
});
test('the photo is optional (owner 2026-11-02): "Ruka kwa sasa" is remembered and the welcome steps follow', () => {
  const navigate = jest.fn();
  render(<AddProfilePhoto currentUser={{ id: 9, onboardingCompleted: false }} onNavigate={navigate} />);
  fireEvent.click(screen.getByTestId('photo-skip'));
  expect(photoSkipped(9)).toBe(true);
  expect(navigate).toHaveBeenCalledWith('Onboarding');
});
