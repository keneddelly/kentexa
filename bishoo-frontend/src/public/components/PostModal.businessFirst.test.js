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

// Owner 2026-11-09: "+" keeps daily jobs only. Opening a business, a community or a hotel is done
// once and lives in Kazi ("Fanya kazi na KenteXa").
test('"+" has only daily jobs: no Fungua biashara / jumuiya / hoteli', () => {
  render(<PostModal activeProfile={{ type: 'personal' }} onNavigate={jest.fn()} onClose={jest.fn()} />);
  for (const text of ['Fungua biashara', 'Fungua jumuiya', 'Fungua hoteli']) expect(screen.queryByText(text)).toBeNull();
  expect(screen.getByText('Moment')).toBeTruthy();
  expect(screen.getByText('Tuma mzigo')).toBeTruthy();
});

test('as a business (BiS): the shop sends its own parcels; no personal "Tuma mzigo", no "Tuma Taarifa" (Moments)', () => {
  const onNavigate = jest.fn();
  render(<PostModal activeProfile={{ type: 'business' }} onNavigate={onNavigate} onClose={jest.fn()} />);
  expect(screen.queryByText('Tuma mzigo')).toBeNull();
  expect(screen.queryByText('post_modal.action_update_title')).toBeNull();
  fireEvent.click(screen.getByText('Tuma mzigo wa duka'));
  expect(onNavigate).toHaveBeenCalledWith('SellerShipment');
});
