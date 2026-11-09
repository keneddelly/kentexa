import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import api from '../../api/api';
import ResalePanel, { resaleLink } from './ResalePanel';

jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), patch: jest.fn() } }));

const product = { id: 3, name: 'Simu Samsung A15', resaleOpen: true };

test('the supplier opens its product for resellers with the price they pay it', async () => {
  api.get.mockResolvedValue({ data: { open: false, own: true, productId: 3, publicPrice: 50000, supplierPrice: null, minPrice: null } });
  api.patch.mockResolvedValue({ data: {} });
  await act(async () => { render(<ResalePanel product={{ ...product, resaleOpen: false }} isOwner isLoggedIn onNavigate={jest.fn()} />); });
  fireEvent.click(screen.getByTestId('resale-allow'));
  fireEvent.change(screen.getByTestId('resale-supplier-price'), { target: { value: '42000' } });
  expect(screen.getByTestId('resale-owner')).toHaveTextContent('anapata TZS 8,000');
  await act(async () => { fireEvent.click(screen.getByTestId('resale-save-terms')); });
  expect(api.patch).toHaveBeenCalledWith('/products/3', { resaleOpen: true, resalePrice: 42000, resaleMinPrice: null });
  expect(screen.getByRole('status')).toHaveTextContent('Imefunguliwa');
});

test('a reseller sets a price on top, sees the profit and gets a link to share', async () => {
  api.get.mockResolvedValue({ data: { open: true, own: false, productId: 3, publicPrice: 50000, supplierPrice: 42000, minPrice: null, floor: 42000, offer: null } });
  api.post.mockResolvedValue({ data: { id: 7, productId: 3, price: 55000, note: null, isActive: true, profitEach: 13000 } });
  await act(async () => { render(<ResalePanel product={product} isLoggedIn onNavigate={jest.fn()} />); });
  fireEvent.click(screen.getByTestId('resale-open'));
  fireEvent.change(screen.getByTestId('resale-my-price'), { target: { value: '40000' } });
  await act(async () => { fireEvent.click(screen.getByTestId('resale-save')); });
  expect(screen.getByRole('alert')).toHaveTextContent('TZS 42,000');
  expect(api.post).not.toHaveBeenCalled();
  fireEvent.change(screen.getByTestId('resale-my-price'), { target: { value: '55000' } });
  expect(screen.getByTestId('resale-profit')).toHaveTextContent('TZS 13,000');
  await act(async () => { fireEvent.click(screen.getByTestId('resale-save')); });
  expect(api.post).toHaveBeenCalledWith('/resale/offers', { productId: 3, price: 55000, note: undefined });
  expect(screen.getByTestId('resale-share')).toBeInTheDocument();
});

test('not shown for a product that is not open; the link carries the offer', async () => {
  const { container } = render(<ResalePanel product={{ ...product, resaleOpen: false }} isLoggedIn onNavigate={jest.fn()} />);
  expect(container).toBeEmptyDOMElement();
  expect(resaleLink(product, 7)).toMatch(/\/product\/3-simu-samsung-a15\?offer=7$/);
});

test('members only (owner 2026-11-10): a non-member sees an invitation, no price; a buyer from a link sees nothing', async () => {
  api.get.mockResolvedValue({ data: { open: true, own: false, productId: 3, member: false } });
  const onNavigate = jest.fn();
  await act(async () => { render(<ResalePanel product={product} isLoggedIn onNavigate={onNavigate} />); });
  expect(screen.getByTestId('resale-join')).not.toHaveTextContent('TZS');
  fireEvent.click(screen.getByText('Jiunge na Uza tena'));
  expect(onNavigate).toHaveBeenCalledWith('MyResales', { tab: 'open' });
});

test('a buyer who opened a reseller link never sees the reseller box', async () => {
  api.get.mockResolvedValue({ data: { open: true, own: false, productId: 3, member: true, supplierPrice: 42000, publicPrice: 50000, floor: 42000, offer: null } });
  let container;
  await act(async () => { ({ container } = render(<ResalePanel product={product} isLoggedIn onNavigate={jest.fn()} buyerView />)); });
  expect(container).toBeEmptyDOMElement();
});
