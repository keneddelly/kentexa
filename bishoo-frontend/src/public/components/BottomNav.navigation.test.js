import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import BottomNav from './BottomNav';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key) => key }) }));

const renderNav = (roleType, activeProfile = { type: 'business', sellerProfileId: 1 }) => {
  const onNavigate = jest.fn();
  render(<BottomNav currentPage="Home" onNavigate={onNavigate} isLoggedIn currentUser={{ name: 'User' }}
    onPostClick={jest.fn()} activeProfile={activeProfile} activeContext={{ roleType, accountRoleId: 1 }}
    onOpenSwitcher={jest.fn()} myProfiles={[activeProfile]} inboxUnread={0} />);
  return onNavigate;
};

test('transport context wins over misleading seller presentation metadata', () => {
  const onNavigate = renderNav('transport_provider');
  fireEvent.click(screen.getAllByRole('button')[1]);
  expect(onNavigate).toHaveBeenCalledWith('TransportProviderDashboard');
});
test('buyer context wins over brand presentation metadata', () => {
  const onNavigate = renderNav('buyer', { type: 'brand' });
  fireEvent.click(screen.getAllByRole('button')[1]);
  expect(onNavigate).toHaveBeenCalledWith('Search');
});
