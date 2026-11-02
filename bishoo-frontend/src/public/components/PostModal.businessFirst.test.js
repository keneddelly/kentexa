import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import PostModal from './PostModal';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: key => key }) }));

test('Personal + listing opens account-scoped My Classifieds without a Seller detour', () => {
  const onNavigate = jest.fn();
  render(<PostModal activeProfile={{ type: 'personal' }} onNavigate={onNavigate} onClose={jest.fn()} />);
  fireEvent.click(screen.getByText('post_modal.action_listing_title'));
  expect(onNavigate).toHaveBeenCalledWith('CreateClassified');
  expect(onNavigate).not.toHaveBeenCalledWith('Home');
  expect(onNavigate).not.toHaveBeenCalledWith('SellerClassifieds');
});

test('Business + listing retains the Business Classified operational destination', () => {
  const onNavigate = jest.fn();
  render(<PostModal activeProfile={{ type: 'business' }} onNavigate={onNavigate} onClose={jest.fn()} />);
  fireEvent.click(screen.getByText('post_modal.action_listing_title'));
  fireEvent.click(screen.getByText('post_modal.casual_listing_title'));
  expect(onNavigate).toHaveBeenCalledWith('SellerClassifieds');
});

test('"+" offers "Fungua hoteli", which opens the business form as a hotel (owner 2026-11-02)', () => {
  const onNavigate = jest.fn();
  const onClose = jest.fn();
  render(<PostModal activeProfile={{ type: 'personal' }} onNavigate={onNavigate} onClose={onClose} />);
  fireEvent.click(screen.getByText('Fungua hoteli'));
  expect(onNavigate).toHaveBeenCalledWith('BecomeBusiness', { category: 'food' });
  expect(onClose).toHaveBeenCalled();
});
