import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import SellerOrders, { tabOf, nextStep, payLabel } from './SellerOrders';
import api from '../../api/api';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k) => k, i18n: { language: 'sw' } }) }));
jest.mock('../../api/api', () => ({ get: jest.fn(), post: jest.fn(), patch: jest.fn() }));
jest.mock('../../api/tokenStore', () => ({ getAccessToken: () => 'token' }));
jest.mock('../components/LipaPaymentReview', () => () => <div data-testid="lipa-review" />);

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{23F3}\u{231B}]/u;
const now = new Date().toISOString();
const ORDERS = [
  { id: 1, status: 'paid', source: 'online', shippingMethod: 'agent', totalAmount: 420000, quantity: 1, product: { name: 'Simu Samsung A15' }, buyer: { name: 'Juma M.', phone: '0712000001' }, deliveryAddress: 'Mbagala, Temeke', createdAt: now },
  { id: 2, status: 'preparing', source: 'seller_shipment', paymentMethod: 'cod', codRemainingBalance: 45000, totalAmount: 45000, quantity: 1, manualProductName: 'Earbuds Oraimo', manualBuyerName: 'Neema K.', phone: '0712000002', trackingNumber: 'KTX-2', createdAt: now },
  { id: 3, status: 'completed', source: 'seller_shipment', totalAmount: 30000, quantity: 1, manualProductName: 'Charger 25W', createdAt: now },
  { id: 4, status: 'disputed', source: 'online', totalAmount: 12000, quantity: 1, product: { name: 'Kava' }, disputeReason: 'Haikufika', createdAt: now },
];

test('tabs are by job: to send, on the way, arrived, problem', () => {
  expect(ORDERS.map(tabOf)).toEqual(['send', 'way', 'done', 'problem']);
  expect(tabOf({ status: 'preparing', source: 'online' })).toBe('send');            // proof still to add
  expect(tabOf({ status: 'preparing', source: 'online', trackingNumber: 'X' })).toBe('way');
  expect(nextStep(ORDERS[0])).toMatchObject({ label: 'Imelipwa. Itume', action: 'engine' });
  expect(nextStep({ status: 'paid', source: 'online', shippingMethod: 'boda' })).toMatchObject({ action: 'modal' });
  expect(nextStep({ status: 'pending_payment', paymentMethod: 'lipa_namba', paymentStatus: 'pending' })).toMatchObject({ action: 'lipa' });
  expect(nextStep(ORDERS[2]).label).toBe('Limekamilika');
});

test('the list shows one next step per order; the market and my own sales are told apart', async () => {
  api.get.mockResolvedValue({ data: ORDERS });
  const onNavigate = jest.fn();
  const { container } = render(<SellerOrders onNavigate={onNavigate} activeProfileId={7} />);
  const list = await screen.findByTestId('order-list');
  expect(api.get).toHaveBeenCalledWith('/seller/orders', { params: { commerceProfileId: 7 } });
  expect(within(list).getAllByRole('listitem')).toHaveLength(1);           // opens on "Za kutuma"
  expect(screen.getByTestId('tab-send')).toHaveTextContent('Za kutuma 1');
  expect(within(list).getByTestId('row-next')).toHaveTextContent('Imelipwa. Itume');
  fireEvent.click(screen.getByTestId('tab-way'));
  expect(screen.getByTestId('order-2')).toHaveTextContent('Mauzo yangu');
  fireEvent.click(screen.getByRole('button', { name: 'Sokoni' }));
  expect(screen.queryByTestId('order-2')).toBeNull();
  expect(EMOJI.test(container.textContent)).toBe(false);
});

test('an order opens with its one action; pay-on-delivery cash can be confirmed there', async () => {
  api.get.mockResolvedValue({ data: ORDERS });
  const onNavigate = jest.fn();
  render(<SellerOrders onNavigate={onNavigate} />);
  fireEvent.click(await screen.findByTestId('order-1'));
  expect(screen.getByTestId('next-step')).toHaveTextContent('Imelipwa. Itume');
  fireEvent.click(screen.getByTestId('next-action'));
  expect(onNavigate).toHaveBeenCalledWith('SellerShipment', expect.objectContaining({ orderId: 1 }));
});

test('my own pay-on-delivery sale: the seller marks the cash received from the order', async () => {
  api.get.mockResolvedValue({ data: ORDERS });
  api.patch.mockResolvedValue({ data: { message: 'Imerekodiwa' } });
  render(<SellerOrders onNavigate={jest.fn()} highlightOrderId={2} />);
  fireEvent.click(await screen.findByTestId('cod-collect'));
  expect(api.patch).toHaveBeenCalledWith('/orders/2/collect-cod-balance');
});

test('every row says how it is paid: pay on delivery and Lipa Namba are obvious', async () => {
  expect(payLabel({ paymentMethod: 'cod', codRemainingBalance: 45000 })).toEqual({ text: 'Lipa ukipokea', tone: 'amber' });
  expect(payLabel({ paymentMethod: 'cod', codBalanceCollected: true })).toMatchObject({ text: 'Lipa ukipokea · amelipa' });
  expect(payLabel({ paymentMethod: 'lipa_namba', paymentStatus: 'pending' })).toMatchObject({ text: 'Lipa Namba · thibitisha' });
  expect(payLabel({ paymentMethod: 'online' })).toBeNull();
  api.get.mockResolvedValue({ data: ORDERS });
  render(<SellerOrders onNavigate={jest.fn()} />);
  fireEvent.click(await screen.findByTestId('tab-way'));
  expect(within(screen.getByTestId('order-2')).getByTestId('row-pay')).toHaveTextContent('Lipa ukipokea');
});

test('a Lipa Namba order (starts as preparing, payment unconfirmed) asks the seller to confirm the money first', async () => {
  const lipa = { id: 9, status: 'preparing', source: 'online', paymentMethod: 'lipa_namba', paymentStatus: 'pending', shippingMethod: 'agent',
    totalAmount: 50000, quantity: 1, product: { name: 'Taa' }, createdAt: new Date().toISOString() };
  expect(nextStep(lipa)).toMatchObject({ label: 'Thibitisha malipo ya Lipa Namba', action: 'lipa' });
  expect(nextStep({ ...lipa, paymentStatus: 'paid' })).toMatchObject({ action: 'engine' });   // then it is sent
  api.get.mockResolvedValue({ data: [lipa] });
  render(<SellerOrders onNavigate={jest.fn()} highlightOrderId={9} />);
  expect(await screen.findByTestId('lipa-review')).toBeInTheDocument();
});
