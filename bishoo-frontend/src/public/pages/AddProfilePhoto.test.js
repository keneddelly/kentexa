import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AddProfilePhoto from './AddProfilePhoto';
import api from '../../api/api';
jest.mock('../../api/api', () => ({ __esModule: true, default: { post: jest.fn(), patch: jest.fn() } }));
const mockT = key => key;
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockT }) }));
beforeEach(() => { jest.clearAllMocks(); localStorage.clear(); });
test('cannot continue before a photo is uploaded', () => {
  render(<AddProfilePhoto currentUser={{ id: 7 }} onNavigate={jest.fn()} />);
  expect(screen.getByText('register.photo_continue_button')).toBeDisabled();
});
test('saves personal photo, refreshes account state and preserves the posting destination', async () => {
  api.post.mockResolvedValue({ data: { urls: ['photo.jpg'] } });
  api.patch.mockResolvedValue({ data: { id: 7, avatarUrl: 'photo.jpg', onboardingCompleted: true } });
  localStorage.setItem('kentexa_after_login', 'CreateClassified');
  const navigate = jest.fn(); const updated = jest.fn();
  const { container } = render(<AddProfilePhoto currentUser={{ id: 7 }} onNavigate={navigate} onUserUpdated={updated} />);
  fireEvent.change(container.querySelector('input[type="file"]'), { target: { files: [new File(['photo'], 'photo.jpg', { type: 'image/jpeg' })] } });
  await waitFor(() => expect(screen.getByText('register.photo_continue_button')).toBeEnabled());
  fireEvent.click(screen.getByText('register.photo_continue_button'));
  await waitFor(() => expect(navigate).toHaveBeenCalledWith('CreateClassified'));
  expect(api.patch).toHaveBeenCalledWith('/users/7', { avatarUrl: 'photo.jpg', onboardingCompleted: true });
  expect(updated).toHaveBeenCalledWith(expect.objectContaining({ avatarUrl: 'photo.jpg', onboardingCompleted: true }));
});
test('failed photo save keeps the user on the photo step and allows retry', async () => {
  api.post.mockResolvedValue({ data: { urls: ['photo.jpg'] } });
  api.patch.mockRejectedValue(new Error('offline'));
  const navigate = jest.fn();
  const { container } = render(<AddProfilePhoto currentUser={{ id: 7 }} onNavigate={navigate} />);
  fireEvent.change(container.querySelector('input[type="file"]'), { target: { files: [new File(['photo'], 'photo.jpg', { type: 'image/jpeg' })] } });
  await waitFor(() => expect(screen.getByText('register.photo_continue_button')).toBeEnabled());
  fireEvent.click(screen.getByText('register.photo_continue_button'));
  await screen.findByText(/register.photo_upload_failed/);
  expect(navigate).not.toHaveBeenCalled();
});
