import React from 'react';
import { act, render } from '@testing-library/react';
import { CartProvider, useCart, mergeGuestCart } from './CartContext';
import { setAccessToken } from '../api/tokenStore';

// Owner 2026-11-10: "when a user has no account, when he starts creating an account the product is lost".
test('a guest line replaces the same product (keeps a reseller offer); other lines stay', () => {
  const mine = [{ id: 1, quantity: 1 }, { id: 2, quantity: 1 }];
  const guest = [{ id: 2, quantity: 3, resaleOfferId: 7 }, { id: 5, quantity: 1 }];
  expect(mergeGuestCart(guest, mine)).toEqual([{ id: 1, quantity: 1 }, { id: 2, quantity: 3, resaleOfferId: 7 }, { id: 5, quantity: 1 }]);
});

test('what a guest put in the cart is still there after signing in', async () => {
  localStorage.clear();
  localStorage.setItem('kentexa_cart_guest', JSON.stringify([{ id: 3, name: 'Simu', quantity: 1, stock: 4, resaleOfferId: 7 }]));
  let seen = null;
  const Probe = () => { seen = useCart().cart; return null; };
  render(<CartProvider><Probe /></CartProvider>);
  expect(seen.map((x) => x.id)).toEqual([3]);
  const token = `x.${btoa(JSON.stringify({ sub: 42 }))}.y`;
  await act(async () => { setAccessToken(token); });
  expect(seen).toEqual([{ id: 3, name: 'Simu', quantity: 1, stock: 4, resaleOfferId: 7 }]);
  expect(JSON.parse(localStorage.getItem('kentexa_cart_user_42'))[0].resaleOfferId).toBe(7);
  expect(localStorage.getItem('kentexa_cart_guest')).toBeNull();
});
