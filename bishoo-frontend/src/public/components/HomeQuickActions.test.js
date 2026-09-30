import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import HomeQuickActions from './HomeQuickActions';
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: key => key }) }));
beforeEach(() => localStorage.clear());
test.each([
  ['listing', 'CreateClassified'], ['service', 'PostService'], ['business', 'BecomeBusiness'],
])('signed-in %s action opens the existing destination', (key, destination) => {
  const onNavigate = jest.fn();
  render(<HomeQuickActions isLoggedIn onNavigate={onNavigate} />);
  fireEvent.click(screen.getByRole('button', { name: `home_quick_actions.${key}` }));
  expect(onNavigate).toHaveBeenCalledWith(destination);
  expect(localStorage.getItem('kentexa_after_login')).toBeNull();
});
test.each([
  ['listing', 'CreateClassified'], ['service', 'PostService'], ['business', 'BecomeBusiness'],
])('guest %s action preserves its destination through login', (key, destination) => {
  const onNavigate = jest.fn();
  render(<HomeQuickActions onNavigate={onNavigate} />);
  fireEvent.click(screen.getByRole('button', { name: `home_quick_actions.${key}` }));
  expect(localStorage.getItem('kentexa_after_login')).toBe(destination);
  expect(onNavigate).toHaveBeenCalledWith('PublicLogin');
});
