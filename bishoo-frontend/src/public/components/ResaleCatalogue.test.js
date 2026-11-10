import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import api from '../../api/api';
import ResaleCatalogue from './ResaleCatalogue';

jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));

const item = { id: 3, name: 'Simu Samsung A15', image: null, category: 'electronics', supplierId: 9, supplierName: 'BIS',
  publicPrice: 50000, supplierPrice: 42000, floor: 42000, profitAtShopPrice: 8000, stock: 4 };
beforeEach(() => {
  api.get.mockImplementation(async (url) => (url === '/resale/products'
    ? { data: { items: [item], categories: [{ key: 'electronics', count: 1 }], hasMore: false, page: 1 } }
    : { data: [{ key: 'electronics', label: 'Elektroniki' }] }));
  api.post.mockResolvedValue({ data: { id: 7, productId: 3, price: 55000 } });
});

test('one place to find products to resell: profit shown, filters sent, resell from the list', async () => {
  await act(async () => { render(<ResaleCatalogue onNavigate={jest.fn()} />); });
  expect(screen.getByTestId('catalogue-3')).toHaveTextContent('Faida TZS 8,000');
  expect(screen.getByTestId('catalogue-cat-electronics')).toHaveTextContent('Elektroniki (1)');
  await act(async () => { fireEvent.click(screen.getByTestId('catalogue-sort-profit')); });
  expect(api.get).toHaveBeenLastCalledWith('/resale/products', { params: { page: 1, sort: 'profit' } });
  fireEvent.change(screen.getByTestId('catalogue-search'), { target: { value: 'simu' } });
  await act(async () => { fireEvent.submit(screen.getByTestId('catalogue-search').closest('form')); });
  expect(api.get).toHaveBeenLastCalledWith('/resale/products', { params: { page: 1, sort: 'profit', q: 'simu' } });
  fireEvent.click(screen.getByTestId('catalogue-resell-3'));
  fireEvent.change(screen.getByTestId('catalogue-price-3'), { target: { value: '40000' } });
  await act(async () => { fireEvent.click(screen.getByTestId('catalogue-save-3')); });
  expect(screen.getByRole('alert')).toHaveTextContent('TZS 42,000');
  fireEvent.change(screen.getByTestId('catalogue-price-3'), { target: { value: '55000' } });
  await act(async () => { fireEvent.click(screen.getByTestId('catalogue-save-3')); });
  expect(api.post).toHaveBeenCalledWith('/resale/offers', { productId: 3, price: 55000 });
  expect(screen.getByTestId('catalogue-share-3')).toBeInTheDocument();
});

test('a shop page opens the catalogue on that shop only', async () => {
  await act(async () => { render(<ResaleCatalogue onNavigate={jest.fn()} supplierId={9} />); });
  expect(api.get).toHaveBeenCalledWith('/resale/products', { params: { page: 1, sort: 'new', supplierId: 9 } });
});

test('growth 2: where the goods leave from, the shop paying record, and a city filter', async () => {
  api.get.mockImplementation(async (url) => (url === '/resale/products'
    ? { data: { items: [{ ...item, fromCity: 'Mwanza', shopRecord: { paid: 5, onTime: 4, late: 1 } }, { ...item, id: 4, shopRecord: { paid: 0, onTime: 0, late: 0 } }],
      categories: [], cities: [{ key: 'Dar es Salaam', count: 7 }, { key: 'Mwanza', count: 2 }], hasMore: false } }
    : { data: [] }));
  await act(async () => { render(<ResaleCatalogue onNavigate={jest.fn()} />); });
  expect(screen.getByTestId('catalogue-3')).toHaveTextContent('inatoka Mwanza');
  expect(screen.getByTestId('catalogue-record-3')).toHaveTextContent('Limewalipa wauzaji mara 5, kwa wakati 4 · 1 limechelewa');
  expect(screen.getByTestId('catalogue-record-4')).toHaveTextContent('Duka jipya kwenye Uza tena');
  await act(async () => { fireEvent.click(screen.getByTestId('catalogue-city-Mwanza')); });
  expect(api.get).toHaveBeenLastCalledWith('/resale/products', { params: { page: 1, sort: 'new', city: 'Mwanza' } });
});
