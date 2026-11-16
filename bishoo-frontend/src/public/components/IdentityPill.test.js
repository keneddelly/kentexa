import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import BottomNav, { IdentityPill } from './BottomNav';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key) => key }) }));

const profiles = [{ type: 'personal', id: 1 }, { type: 'business', id: 2 }];

test('#374 C: the identity pill no longer floats above the bottom bar', () => {
  render(<BottomNav currentPage="Home" onNavigate={jest.fn()} isLoggedIn currentUser={{ name: 'User' }} onPostClick={jest.fn()}
    activeProfile={profiles[1]} activeContext={{ roleType: 'seller', accountRoleId: 2 }} activeBusinessName="Bishoo Electronics"
    onOpenSwitcher={jest.fn()} myProfiles={profiles} inboxUnread={0} />);
  expect(screen.queryByText(/Bishoo Electronics/)).toBeNull();
});

test('#374 C: in a top bar it names who you act as and opens the switcher', () => {
  const open = jest.fn();
  render(<IdentityPill activeProfile={profiles[1]} activeContext={{ roleType: 'seller' }} activeBusinessName="Bishoo Electronics"
    myProfiles={profiles} onOpenSwitcher={open} />);
  const pill = screen.getByTestId('identity-pill');
  expect(pill).toHaveTextContent('Bishoo Electronics · business_home.tile_commerce');
  fireEvent.click(pill);
  expect(open).toHaveBeenCalled();
});

test('#374 C: nothing to switch to, no pill', () => {
  const { container } = render(<IdentityPill activeProfile={profiles[0]} myProfiles={[profiles[0]]} onOpenSwitcher={jest.fn()} />);
  expect(container).toBeEmptyDOMElement();
});
