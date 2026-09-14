import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import PostModal from './PostModal';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: key => key }) }));

test('Personal + listing opens account-scoped My Classifieds without a Seller detour', () => {
  const onNavigate = jest.fn();
  render(<PostModal activeProfile={{ type: 'personal' }} onNavigate={onNavigate} onClose={jest.fn()} />);
  fireEvent.click(screen.getByText('post_modal.action_listing_title'));
  expect(onNavigate).toHaveBeenCalledWith('MyClassifieds');
  expect(onNavigate).not.toHaveBeenCalledWith('Home');
});

test('Business + listing retains the Business Classified operational destination', () => {
  const onNavigate = jest.fn();
  render(<PostModal activeProfile={{ type: 'business' }} onNavigate={onNavigate} onClose={jest.fn()} />);
  fireEvent.click(screen.getByText('post_modal.action_listing_title'));
  fireEvent.click(screen.getByText('post_modal.casual_listing_title'));
  expect(onNavigate).toHaveBeenCalledWith('SellerClassifieds');
});
