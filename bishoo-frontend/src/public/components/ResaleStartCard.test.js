import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import api from '../../api/api';
import ResaleStartCard from './ResaleStartCard';

jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn() } }));

const wants = { onboardingState: { goals: ['resell'] } };
const routes = (map) => api.get.mockImplementation(async (url) => ({ data: map[url] }));
beforeEach(() => { localStorage.clear(); api.get.mockReset(); });

test('a member with no offer sees the two best-profit products and the full list', async () => {
  routes({ '/resale/membership': { member: true }, '/resale/mine': [],
    '/resale/products': { items: [
      { id: 3, name: 'Simu', profitAtShopPrice: 8000 }, { id: 4, name: 'Taa', profitAtShopPrice: 2000 }, { id: 5, name: 'Redio', profitAtShopPrice: 1000 },
    ] } });
  const onNavigate = jest.fn();
  await act(async () => { render(<ResaleStartCard currentUser={wants} onNavigate={onNavigate} />); });
  expect(screen.getByTestId('resale-start-3')).toHaveTextContent('faida TZS 8,000');
  expect(screen.getByTestId('resale-start-4')).toBeInTheDocument();
  expect(screen.queryByTestId('resale-start-5')).toBeNull();
  fireEvent.click(screen.getByTestId('resale-start-all'));
  expect(onNavigate).toHaveBeenCalledWith('MyResales', { tab: 'open' });
});

test('not joined yet: an invitation, no prices', async () => {
  routes({ '/resale/membership': { member: false }, '/resale/mine': [] });
  await act(async () => { render(<ResaleStartCard currentUser={wants} onNavigate={jest.fn()} />); });
  expect(screen.getByTestId('resale-start-join')).toBeInTheDocument();
  expect(screen.getByTestId('resale-start')).not.toHaveTextContent('TZS');
  expect(api.get).not.toHaveBeenCalledWith('/resale/products', expect.anything());
});

test('nothing for people already reselling, people who did not choose it, or after Ficha', async () => {
  routes({ '/resale/membership': { member: true }, '/resale/mine': [{ id: 7 }] });
  const a = render(<ResaleStartCard currentUser={wants} onNavigate={jest.fn()} />);
  await act(async () => {});
  expect(screen.queryByTestId('resale-start')).toBeNull();
  a.unmount();
  render(<ResaleStartCard currentUser={{ onboardingState: { goals: ['buy'] } }} onNavigate={jest.fn()} />);
  expect(api.get).toHaveBeenCalledTimes(2);
  routes({ '/resale/membership': { member: false }, '/resale/mine': [] });
  const c = render(<ResaleStartCard currentUser={wants} onNavigate={jest.fn()} />);
  await act(async () => {});
  fireEvent.click(screen.getByTestId('resale-start-hide'));
  expect(screen.queryByTestId('resale-start')).toBeNull();
  c.unmount();
});
