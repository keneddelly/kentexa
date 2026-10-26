import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Search from './Search';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k) => k }) }));
jest.mock('../components/WishlistHeart', () => () => null);
jest.mock('../hooks/useAnalytics', () => ({ trackSearch: jest.fn() }));

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{23F3}\u{231B}]/u;

beforeEach(() => {
  api.get.mockImplementation((url) => {
    if (url.startsWith('/classifieds/search')) return Promise.resolve({ data: { classifieds: [
      { id: 5, title: 'Samsung A15 mpya', price: 420000, location: 'Kariakoo', images: [], seller: { id: 9, storeName: 'Drone Phonex', isVerified: true } },
    ] } });
    if (url === '/seller/public/all') return Promise.resolve({ data: [{ id: 9, userId: 9, storeName: 'Drone Phonex', businessLocation: 'Kariakoo' }] });
    if (url.startsWith('/services')) return Promise.resolve({ data: { ads: [] } });
    return Promise.resolve({ data: [] });
  });
});

test('Soko: text category chips, businesses, and listings that show who sells them; no emoji', async () => {
  const onNavigate = jest.fn();
  const { container } = render(<Search onNavigate={onNavigate} isLoggedIn />);
  expect(screen.getByRole('heading', { name: 'Soko' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'search.cat_phones' })).toBeInTheDocument();
  expect(await screen.findByText('Samsung A15 mpya')).toBeInTheDocument();
  expect(screen.getByText('TZS 420,000')).toBeInTheDocument();
  expect(screen.getByText('Drone Phonex · Kariakoo')).toBeInTheDocument();
  expect(EMOJI.test(container.textContent)).toBe(false);

  const seeAll = screen.getAllByRole('button', { name: 'search.see_all' });
  fireEvent.click(seeAll[seeAll.length - 1]);
  expect(onNavigate).toHaveBeenCalledWith('ClassifiedsPublic');

  fireEvent.click(screen.getByText('Samsung A15 mpya'));
  expect(onNavigate).toHaveBeenCalledWith('ClassifiedDetail-5');
});
