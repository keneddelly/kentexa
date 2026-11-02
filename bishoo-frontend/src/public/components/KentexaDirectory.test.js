import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import KentexaDirectory, { DIRECTORY_KINDS } from './KentexaDirectory';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ get: jest.fn() }));
beforeEach(() => api.get.mockReset());
const show = async (kind) => {
  const onNavigate = jest.fn();
  await act(async () => { render(<KentexaDirectory kind={kind} onNavigate={onNavigate} />); });
  return onNavigate;
};

test('the catalogue tabs (owner 2026-11-02): products, services, hotels, classifieds, businesses', () => {
  expect(DIRECTORY_KINDS).toEqual(['products', 'services', 'hotels', 'classifieds', 'businesses']);
});

test('Bidhaa lists every product and opens it', async () => {
  api.get.mockResolvedValue({ data: [{ id: 4, name: 'Taa ya sola', displayPrice: 45000, images: ['a.jpg'], seller: { storeName: 'Bishoo' } }] });
  const onNavigate = await show('products');
  expect(api.get).toHaveBeenCalledWith('/products');
  expect(screen.getByTestId('directory-item')).toHaveTextContent('Taa ya solaTZS 45,000Bishoo');
  fireEvent.click(screen.getByTestId('directory-item'));
  expect(onNavigate).toHaveBeenCalledWith('ProductDetail-4', undefined);
});

test('Biashara lists every business and opens its exact profile', async () => {
  api.get.mockResolvedValue({ data: { items: [{ id: 75, ownerId: 9, displayName: 'Bishoo Electronics', category: 'Elektroniki', followersCount: 1240, isVerified: true }], total: 1 } });
  const onNavigate = await show('businesses');
  expect(api.get).toHaveBeenCalledWith('/profiles/directory/businesses', { params: { limit: 60 } });
  fireEvent.click(screen.getByTestId('directory-item'));
  expect(onNavigate).toHaveBeenCalledWith('CommerceProfile-9', { commerceProfileId: 75 });
});

test('Hoteli opens the hotel menu; says whether it takes orders now', async () => {
  api.get.mockResolvedValue({ data: [{ businessId: 12, name: 'ABC Hotel', open: true, items: 14, location: 'Mwanza' }] });
  const onNavigate = await show('hotels');
  expect(screen.getByTestId('directory-item')).toHaveTextContent('Inapokea oda sasa');
  fireEvent.click(screen.getByTestId('directory-item'));
  expect(onNavigate).toHaveBeenCalledWith('HotelMenu-12', undefined);
});

test('nothing yet, or a failed call: says so, invents nothing', async () => {
  api.get.mockRejectedValue(new Error('down'));
  await show('classifieds');
  expect(screen.getByTestId('directory-classifieds')).toHaveTextContent('Bado hakuna matangazo.');
});
