import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import CommerceProfile from './CommerceProfile';
import api from '../../api/api';
jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
const mockT = key => key;
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockT }) }));

test('Uza tena: a reseller profile shows "Anauza" with their price; a buyer opens the product with their offer', async () => {
  const p = { id: 70, ownerId: 42, type: 'personal', displayName: 'Neema', followersCount: 0, followingCount: 0 };
  api.get.mockImplementation(url => {
    if (url === '/profiles/for-user/42') return Promise.resolve({ data: [p] });
    if (url === '/profiles/70') return Promise.resolve({ data: p });
    if (url === '/resale/sellers/42/offers') return Promise.resolve({ data: [{ offerId: 7, productId: 3, name: 'Simu Samsung A15', image: null, price: 55000, note: 'Napeleka bure', stock: 4 }] });
    return Promise.resolve({ data: [] });
  });
  const onNavigate = jest.fn();
  render(<CommerceProfile pageParam="42" currentUser={{ id: 99 }} isLoggedIn onNavigate={onNavigate} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Anauza' }));
  expect(screen.getByTestId('shelf-7')).toHaveTextContent('TZS 55,000');
  fireEvent.click(screen.getByTestId('shelf-7'));
  expect(onNavigate).toHaveBeenCalledWith('ProductDetail-3', { offerId: 7 });
});
