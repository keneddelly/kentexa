import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import BottomNav from './BottomNav';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key) => key }) }));

const renderNav = (roleType, activeProfile = { type: 'business', sellerProfileId: 1 }) => {
  const onNavigate = jest.fn();
  render(<BottomNav currentPage="Home" onNavigate={onNavigate} isLoggedIn currentUser={{ name: 'User' }}
    onPostClick={jest.fn()} activeProfile={activeProfile} activeContext={{ roleType, accountRoleId: 1 }}
    onOpenSwitcher={jest.fn()} myProfiles={[activeProfile]} inboxUnread={0} />);
  return onNavigate;
};

test('one bar for every role (owner 2026-11-01): Mwanzo, Tafuta, +, Inbox, Kazi', () => {
  for (const role of ['buyer', 'seller', 'transport_provider', 'super_agent', 'agent', 'service_provider']) {
    const onNavigate = renderNav(role, role === 'buyer' ? { type: 'brand' } : undefined);
    expect(screen.getByLabelText('nav.home')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('common.search'));
    expect(onNavigate).toHaveBeenCalledWith('Search');
    fireEvent.click(screen.getByLabelText('bottom_nav.workspace'));
    expect(onNavigate).toHaveBeenCalledWith('Workspace');
    expect(screen.queryByLabelText('nav.profile')).toBeNull();
    cleanup();
  }
});

test('tab icons are line icons, never emoji', () => {
  for (const role of ['buyer', 'seller', 'agent', 'super_agent', 'transport_provider', 'service_provider', 'admin']) {
    const { container, unmount } = render(<BottomNav currentPage="Home" onNavigate={jest.fn()} isLoggedIn currentUser={{ name: 'User' }}
      onPostClick={jest.fn()} activeProfile={{ type: 'hub' }} activeContext={{ roleType: role, accountRoleId: 1 }}
      onOpenSwitcher={jest.fn()} myProfiles={[{ type: 'hub' }, { type: 'personal' }]} inboxUnread={0} />);
    expect(container.textContent).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{25BE}]/u);
    expect(container.querySelectorAll('svg').length).toBeGreaterThanOrEqual(4);
    unmount();
  }
  expect(screen.queryByText('💬')).toBeNull();
});

test('on a computer the same places sit in a left side menu, with the profile, and the page makes room', () => {
  const original = window.matchMedia;
  window.matchMedia = jest.fn().mockImplementation((q) => ({ matches: true, media: q, addEventListener: jest.fn(), removeEventListener: jest.fn() }));
  try {
    const onNavigate = jest.fn();
    const { unmount } = render(<BottomNav currentPage="Workspace" onNavigate={onNavigate} isLoggedIn currentUser={{ name: 'User' }}
      onPostClick={jest.fn()} activeProfile={{ type: 'personal' }} activeContext={{ roleType: 'seller', accountRoleId: 1 }}
      onOpenSwitcher={jest.fn()} myProfiles={[{ type: 'personal' }]} inboxUnread={3} />);
    expect(screen.getByTestId('side-nav')).toBeInTheDocument();
    expect(document.body.classList.contains('kx-has-sidenav')).toBe(true);
    fireEvent.click(screen.getByText('bottom_nav.workspace'));
    expect(onNavigate).toHaveBeenCalledWith('Workspace');
    fireEvent.click(screen.getByText('nav.profile'));
    expect(onNavigate).toHaveBeenCalledWith('MyProfile');
    expect(screen.getByText('3')).toBeInTheDocument(); // unread messages on Inbox
    unmount();
    expect(document.body.classList.contains('kx-has-sidenav')).toBe(false);
  } finally {
    window.matchMedia = original;
  }
});
