import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SellerShipment, { firstStep, sameCity } from './SellerShipment';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ get: jest.fn(), post: jest.fn() }));
// The place search is its own tested component: here it hands back a picked place.
jest.mock('../components/PlaceSearchField', () => {
  const placeLabel = (l) => [l?.wardName, l?.districtName, l?.regionName].filter(Boolean).join(', ');
  const Field = ({ id, value, onChange }) => (
    <input id={id} aria-label="Mahali pa mteja" value={placeLabel(value)}
      onChange={(e) => onChange(e.target.value === 'mbeya'
        ? { wardName: '', districtName: 'Mbeya Mjini', regionName: 'Mbeya' }
        : { wardName: 'Mbezi Beach', districtName: 'Kinondoni', regionName: 'Dar es Salaam' })} />
  );
  return { __esModule: true, default: Field, placeLabel };
});
jest.mock('../components/IntelligentLocationInput', () => () => null);

const GETS = {
  '/store/profile': { businessLocation: 'Dar es Salaam, Kariakoo' },
  '/products/my/products': [{ id: 4, name: 'Saa ya ukutani', price: 300000, weightKg: 2 }],
  '/classifieds/user/mine': [],
  '/super-agents/shipments/last-pickup': { pickup: { label: 'Kariakoo, Ilala, Dar es Salaam' } },
  '/super-agents/shipments/boda-fee': { fee: 3000 },
};
beforeEach(() => {
  api.get.mockReset(); api.post.mockReset();
  api.get.mockImplementation(async (url) => {
    if (url.startsWith('/business/customers')) return { data: { customers: [{ id: 1, name: 'Amina Juma', phone: '0712000222', region: 'Dar es Salaam', district: 'Kinondoni', ward: 'Mbezi Beach' }] } };
    return { data: GETS[url] ?? null };
  });
  api.post.mockResolvedValue({ data: { trackingNumber: 'KTX-ORD-9', customerNumber: 'KTX 4829 1037 52', billing: null } });
});
const nextBtn = (n) => screen.getByTestId(`next-${n}`);

test('four short steps: product, a recent customer in one tap, paid; KenteXa picks the agent in the city', async () => {
  render(<SellerShipment isLoggedIn onNavigate={jest.fn()} />);
  expect(nextBtn(1).disabled).toBe(true);
  fireEvent.click(await screen.findByRole('radio', { name: /Saa ya ukutani/ }));
  fireEvent.click(nextBtn(1));
  fireEvent.click(await screen.findByRole('button', { name: 'Amina Juma' }));
  expect(screen.getByLabelText('Simu').value).toBe('0712000222');
  fireEvent.click(nextBtn(2));
  fireEvent.click(screen.getByTestId('pay-paid'));
  fireEvent.click(nextBtn(3));
  expect(screen.getByTestId('delivery-choice').textContent).toMatch(/Wakala wa karibu/);
  fireEvent.click(nextBtn(4));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/super-agents/shipments', expect.objectContaining({
    recipientName: 'Amina Juma', recipientPhone: '0712000222', destinationCity: 'Dar es Salaam', originCity: 'Dar es Salaam',
    transportMethod: 'boda', totalValue: 300000, weightKg: 2, isCod: undefined,
  })));
  expect(await screen.findByTestId('seller-send-number')).toHaveTextContent('KTX 4829 1037 52');
});

test('pay on delivery: the boda fee and the shop place are already filled in, nothing to type', async () => {
  render(<SellerShipment isLoggedIn onNavigate={jest.fn()} />);
  fireEvent.click(await screen.findByRole('radio', { name: /Saa ya ukutani/ }));
  fireEvent.click(nextBtn(1));
  fireEvent.click(await screen.findByRole('button', { name: 'Amina Juma' }));
  fireEvent.click(nextBtn(2));
  fireEvent.click(screen.getByTestId('pay-cod'));
  expect(await screen.findByTestId('boda-fee')).toHaveTextContent('TZS 3,000');
  expect(screen.getByTestId('last-pickup')).toHaveTextContent('Kariakoo, Ilala, Dar es Salaam');
  fireEvent.click(nextBtn(3));
  expect(screen.getByText(/Amina Juma atalipa/).nextSibling).toHaveTextContent('TZS 303,000');
  fireEvent.click(nextBtn(4));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/super-agents/shipments', expect.objectContaining({
    isCod: true, codAmountPaid: 0, bodaFee: undefined, pickupPlace: undefined, transportMethod: 'boda',
  })));
});

test('from POS (paid): opens at the customer, skips payment, sends the sale', async () => {
  render(<SellerShipment isLoggedIn onNavigate={jest.fn()} prefill={{
    saleId: 77, isCod: false, name: 'Neema', phone: '0754000111',
    items: [{ name: 'Taa ya mezani', qty: 2, price: 45000, productId: 9 }],
  }} />);
  expect(screen.getByText('Hatua 2 kati ya 4')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Mahali pa mteja'), { target: { value: 'mbezi' } });
  fireEvent.click(nextBtn(2));
  expect(screen.getByText('Hatua 4 kati ya 4')).toBeTruthy();
  fireEvent.click(nextBtn(4));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/super-agents/shipments', expect.objectContaining({
    saleId: 77, recipientName: 'Neema', totalValue: 90000, isCod: undefined,
  })));
});

test('another city: the office carries it, and pay-on-delivery is refused', async () => {
  render(<SellerShipment isLoggedIn onNavigate={jest.fn()} />);
  fireEvent.click(await screen.findByRole('radio', { name: /Saa ya ukutani/ }));
  fireEvent.click(nextBtn(1));
  fireEvent.change(await screen.findByLabelText('Jina'), { target: { value: 'Juma' } });
  fireEvent.change(screen.getByLabelText('Simu'), { target: { value: '0713000999' } });
  fireEvent.change(screen.getByLabelText('Mahali pa mteja'), { target: { value: 'mbeya' } });
  fireEvent.click(nextBtn(2));
  fireEvent.click(screen.getByTestId('pay-cod'));
  expect(screen.getByRole('alert')).toHaveTextContent('ndani ya mji mmoja tu');
  expect(nextBtn(3).disabled).toBe(true);
  fireEvent.click(screen.getByTestId('pay-paid'));
  fireEvent.click(nextBtn(3));
  expect(screen.getByTestId('delivery-choice').textContent).toMatch(/Ofisi ya KenteXa/);
  fireEvent.click(nextBtn(4));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/super-agents/shipments', expect.objectContaining({
    destinationCity: 'Mbeya', transportMethod: 'super_agent',
  })));
});

test('where to open, and same city', () => {
  expect(firstStep({ items: [] })).toBe(1);
  expect(firstStep({ items: [{}], name: 'A', phone: '0712000111', place: {} })).toBe(2);
  expect(firstStep({ items: [{}], name: 'A', phone: '0712000111', place: { regionName: 'Dar es Salaam' }, paymentKnown: true })).toBe(4);
  expect(sameCity('Dar es Salaam', 'dar')).toBe(true);
  expect(sameCity('Mbeya', 'Dar es Salaam')).toBe(false);
});
