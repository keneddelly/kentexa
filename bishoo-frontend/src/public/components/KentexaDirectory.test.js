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
  expect(api.get).toHaveBeenCalledWith('/profiles/directory/businesses', { params: { limit: 30, offset: 0 } });
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

test('paging: a long list shows 30, then 30 more on "Ona zaidi" (owner 2026-11-02)', async () => {
  const many = Array.from({ length: 45 }, (_, i) => ({ id: i + 1, name: `Bidhaa ${i + 1}`, displayPrice: 1000 }));
  api.get.mockResolvedValue({ data: many });
  await show('products');
  expect(screen.getAllByTestId('directory-item')).toHaveLength(30);
  fireEvent.click(screen.getByTestId('directory-more'));
  expect(screen.getAllByTestId('directory-item')).toHaveLength(45);
  expect(screen.queryByTestId('directory-more')).toBeNull();
  expect(api.get).toHaveBeenCalledTimes(1);
});

test('paging: businesses ask the server for the next page until there is no more', async () => {
  const page = (from, n) => Array.from({ length: n }, (_, i) => ({ id: from + i, ownerId: 1, displayName: `Biashara ${from + i}` }));
  api.get
    .mockResolvedValueOnce({ data: { items: page(1, 30), total: 35 } })
    .mockResolvedValueOnce({ data: { items: page(31, 5), total: 35 } });
  await show('businesses');
  expect(screen.getAllByTestId('directory-item')).toHaveLength(30);
  await act(async () => { fireEvent.click(screen.getByTestId('directory-more')); });
  expect(api.get).toHaveBeenLastCalledWith('/profiles/directory/businesses', { params: { limit: 30, offset: 30 } });
  expect(screen.getAllByTestId('directory-item')).toHaveLength(35);
  expect(screen.queryByTestId('directory-more')).toBeNull();
});
