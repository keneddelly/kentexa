import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ProductDetail from './ProductDetail';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), defaults: { baseURL: '' } } }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k) => k }) }));
jest.mock('../components/WishlistHeart', () => () => null);
jest.mock('../components/CommerceCommentSection', () => () => null);
jest.mock('../hooks/useAnalytics', () => ({ trackProductView: jest.fn(), trackAddToCart: jest.fn() }));
jest.mock('../../context/CartContext', () => ({ useCart: () => ({ addToCart: () => true, isInCart: () => false }) }));

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{23F3}\u{231B}]/u;
const PRODUCT = {
  id: 7, name: 'Samsung Galaxy A15', basePrice: 420000, displayPrice: 420000, isAvailable: true, stock: 5,
  category: 'electronics', images: [], salesCount: 0,
  seller: { id: 9, storeName: 'Drone Phonex' },
  commerceProfile: { id: 3, displayName: 'Drone Phonex', isVerified: true, followersCount: 120 },
};

beforeEach(() => {
  api.post.mockResolvedValue({ data: {} });
  api.get.mockImplementation((url) => {
    if (url === '/products/7') return Promise.resolve({ data: PRODUCT });
    return Promise.resolve({ data: [] });
  });
});

test('product page: real price only, the business behind it, Agiza; no emoji or promises KenteXa does not give', async () => {
  const onNavigate = jest.fn();
  const { container } = render(<ProductDetail productId={7} onNavigate={onNavigate} isLoggedIn currentUser={{ id: 1 }} />);
  expect(await screen.findByTestId('pd-price')).toHaveTextContent('TZS 420,000');
  expect(container.textContent).not.toMatch(/504,000/); // no invented "was" price
  expect(container.textContent).not.toMatch(/buyer_protection|returns_policy|genuine_product|free_delivery/);
  const seller = screen.getByTestId('pd-seller');
  expect(seller).toHaveTextContent('Drone Phonex');
  expect(seller).toHaveTextContent('120 commerce_profile.stat_followers');
  expect(EMOJI.test(container.textContent)).toBe(false);

  fireEvent.click(screen.getByRole('button', { name: 'product_detail.message_seller' }));
  expect(onNavigate).toHaveBeenCalledWith('MessageSeller-9', { commerceProfileId: 3, contextType: 'product', contextId: 7 });
  fireEvent.click(screen.getByRole('button', { name: /Agiza · TZS 420,000/ }));
  expect(onNavigate).toHaveBeenCalledWith('Checkout');
});

test('loading shows the spinner page, not an hourglass', () => {
  api.get.mockImplementation(() => new Promise(() => {}));
  render(<ProductDetail productId={7} onNavigate={jest.fn()} />);
  expect(screen.getByTestId('page-loading')).toHaveTextContent('product_detail.loading');
});
