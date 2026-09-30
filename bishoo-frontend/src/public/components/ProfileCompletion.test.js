import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ProfileCompletion from './ProfileCompletion';
const mockT = key => key;
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockT }) }));
const user = { id: 1, onboardingCompleted: true, storeDescription: 'Business bio', logo: 'business.jpg' };
test('personal completion remains visible after account onboarding and ignores business fields', () => {
  const navigate = jest.fn();
  render(<ProfileCompletion currentUser={user} userRole="seller" personalProfile={{ displayName: 'Amina', username: 'amina' }} compact onNavigate={navigate} />);
  expect(screen.getByText('2/5')).toBeInTheDocument();
  fireEvent.click(screen.getByText('profile_completion.step_bio'));
  expect(navigate).toHaveBeenCalledWith('CustomerProfile', { editField: 'bio' });
  expect(screen.queryByText('profile_completion.step_store')).not.toBeInTheDocument();
});
test('completed personal profiles retain an edit link', () => {
  render(<ProfileCompletion currentUser={user} personalProfile={{ displayName: 'Amina', username: 'amina', photoUrl: 'photo.jpg', bio: 'Designer', location: 'Dar' }} compact onNavigate={jest.fn()} />);
  expect(screen.getByText('5/5')).toBeInTheDocument();
  expect(screen.getByText(/profile_completion.edit_personal/)).toBeInTheDocument();
});
test('homepage account setup stays hidden after onboarding', () => {
  const { container } = render(<ProfileCompletion currentUser={user} compact onNavigate={jest.fn()} />);
  expect(container).toBeEmptyDOMElement();
});
