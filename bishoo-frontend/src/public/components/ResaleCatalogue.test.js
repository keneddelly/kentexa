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
