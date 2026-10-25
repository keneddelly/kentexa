import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SellerShipment, { firstStep, sameCity, sellerOffers, matchSavedPlace } from './SellerShipment';
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
  const fromCandidate = (c) => ({ regionName: c.regionName || '', districtName: c.districtName || '', wardName: c.wardName || '',
    displayLabel: c.displayLabel || '', placeRef: c.placeRef || null });
  return { __esModule: true, default: Field, placeLabel, fromCandidate };
});
jest.mock('../components/IntelligentLocationInput', () => () => null);

const GETS = {
  '/store/profile': { businessLocation: 'Dar es Salaam, Kariakoo' },
  '/products/my/products': [{ id: 4, name: 'Saa ya ukutani', price: 300000, weightKg: 2 }],
  '/classifieds/user/mine': [],
  '/super-agents/shipments/last-pickup': { pickup: { label: 'Kariakoo, Ilala, Dar es Salaam', city: 'Dar es Salaam',
    placeRef: { providerKey: 'tz_seed', providerPlaceId: 'ward:6' }, point: { latitude: -6.82, longitude: 39.27 } } },
  '/super-agents/shipments/boda-fee': { fee: 3000 },
};
beforeEach(() => {
  api.get.mockReset(); api.post.mockReset();
  api.get.mockImplementation(async (url) => {
    if (url.startsWith('/business/customers')) return { data: { customers: [{ id: 1, name: 'Amina Juma', phone: '0712000222', region: 'Dar es Salaam', district: 'Kinondoni', ward: 'Mbezi Beach' }] } };
    if (url === '/location-intelligence/places') return { data: { candidates: [MBEZI_BEACH, { ...MBEZI_BEACH, districtName: 'Ubungo', wardName: 'Mbezi', placeRef: { providerKey: 'tz_seed', providerPlaceId: 'ward:99' } }] } };
    return { data: GETS[url] ?? null };
  });
  api.post.mockImplementation(async (url, body) => {
    if (url === '/transport/service-offers/discover') {
      return { data: body.toCity === 'Mbeya' ? [OFFICE_MBEYA] : [{ serviceType: 'direct_delivery', price: 4000 }, OFFICE_DAR] };
    }
    if (url === '/transport/service-offers/commit') return { data: { id: 31 } };
    if (url === '/shipments') return { data: { id: 88 } };
    return { data: { trackingNumber: 'KTX-ORD-9', customerNumber: 'KTX 4829 1037 52', billing: null } };
  });
});
const MBEZI_BEACH = { displayLabel: 'Mbezi Beach, Kinondoni', wardName: 'Mbezi Beach', districtName: 'Kinondoni', regionName: 'Dar es Salaam',
  placeRef: { providerKey: 'tz_seed', providerPlaceId: 'ward:41' } };
const office = (id, name, city, price) => ({ serviceType: 'office', name, price, fulfillment: { officeOption: { officeId: id, officeCity: city, officeAddress: `${city} stendi` } } });
const OFFICE_DAR = office(5, 'Ofisi Kariakoo', 'Dar es Salaam', 5000);
const OFFICE_MBEYA = office(6, 'Ofisi Ubungo', 'Dar es Salaam', 12000);
const posted = (url) => api.post.mock.calls.filter((c) => c[0] === url).map((c) => c[1]);
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
  // The same engine as the customer form: the agent first, the office that delivers in town too.
  expect(await screen.findByTestId('offer-direct')).toHaveAttribute('aria-checked', 'true');
  expect(screen.getByTestId('offer-office-5')).toHaveTextContent('Ofisi Kariakoo · TZS 5,000');
  // The saved customer's place is matched to the known ward, so the agent can be offered.
  await waitFor(() => expect(posted('/transport/service-offers/discover').at(-1)).toMatchObject({
    destination: { place: { providerKey: 'tz_seed', providerPlaceId: 'ward:41' } } }));
  expect(posted('/transport/service-offers/discover').at(-1)).toMatchObject({
    fromCity: 'Dar es Salaam', toCity: 'Dar es Salaam', pickup: 'door', delivery: 'door',
    origin: { place: { providerKey: 'tz_seed', providerPlaceId: 'ward:6' } }, pickupPoint: { latitude: -6.82, longitude: 39.27 },
  });
  fireEvent.click(nextBtn(4));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/super-agents/shipments', expect.objectContaining({
    shipmentId: 88, confirm: {},
    recipientName: 'Amina Juma', recipientPhone: '0712000222', destinationCity: 'Dar es Salaam', originCity: 'Dar es Salaam',
    totalValue: 300000, weightKg: 2, isCod: undefined,
  })));
  expect(posted('/transport/service-offers/commit')[0]).toMatchObject({ serviceType: 'direct_delivery' });
  expect(posted('/shipments')[0]).toMatchObject({ journeySelectionId: 31, receiverName: 'Amina Juma', pickupOption: 'door', deliveryOption: 'door' });
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
  // Pay-on-delivery rides only on the agent: no office to choose.
  expect(await screen.findByTestId('offer-direct')).toBeTruthy();
  expect(screen.queryByTestId('offer-office-5')).toBeNull();
  fireEvent.click(nextBtn(4));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/super-agents/shipments', expect.objectContaining({
    shipmentId: 88, isCod: true, codAmountPaid: 0, bodaFee: undefined,
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
  await screen.findByTestId('offer-direct');
  fireEvent.click(nextBtn(4));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/super-agents/shipments', expect.objectContaining({
    saleId: 77, recipientName: 'Neema', totalValue: 90000, isCod: undefined,
  })));
});

test('another city: offices compete, and pay-on-delivery is refused', async () => {
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
  expect(await screen.findByTestId('offer-office-6')).toHaveTextContent('Ofisi Ubungo · TZS 12,000');
  expect(screen.queryByTestId('offer-direct')).toBeNull();
  fireEvent.click(nextBtn(4));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/super-agents/shipments', expect.objectContaining({
    shipmentId: 88, destinationCity: 'Mbeya',
  })));
  expect(posted('/transport/service-offers/commit')[0]).toMatchObject({ serviceType: 'office', officeId: 6, declaredValue: 300000 });
  expect(posted('/shipments')[0]).toMatchObject({ journeySelectionId: 31, pickupOption: 'station', deliveryOption: 'station' });
});

test('where to open, and same city', () => {
  expect(firstStep({ items: [] })).toBe(1);
  expect(firstStep({ items: [{}], name: 'A', phone: '0712000111', place: {} })).toBe(2);
  expect(firstStep({ items: [{}], name: 'A', phone: '0712000111', place: { regionName: 'Dar es Salaam' }, paymentKnown: true })).toBe(4);
  expect(sameCity('Dar es Salaam', 'dar')).toBe(true);
  expect(sameCity('Mbeya', 'Dar es Salaam')).toBe(false);
});

test('the offers: the agent, offices, and transporters only when nothing more must be asked', () => {
  const t = (id, origins, dests) => ({ serviceType: 'composed_intercity', price: 9000,
    fulfillment: { transportOption: { providerId: id, routeId: 1, runId: 2, originPoints: origins, destinationPoints: dests } } });
  const list = [{ serviceType: 'direct_delivery', price: 4000 }, OFFICE_DAR, t(1, [{ hubId: 1 }], [{ hubId: 2 }]), t(2, [{ hubId: 1 }, { hubId: 3 }], [{ hubId: 2 }])];
  expect(sellerOffers(list, { inCity: true, cod: true }).map((o) => o.key)).toEqual(['direct']);
  expect(sellerOffers(list, { inCity: true, cod: false }).map((o) => o.key)).toEqual(['direct', 'office-5']);
  expect(sellerOffers(list, { inCity: false, cod: false }).map((o) => o.key)).toEqual(['direct', 'office-5', 't-1-1']);
  expect(sellerOffers(list, { inCity: false, cod: true })).toEqual([]);
});

test('a saved place is matched only when exactly one known place fits', () => {
  const other = { ...MBEZI_BEACH, wardName: 'Mbezi', districtName: 'Ubungo', placeRef: { providerKey: 'tz_seed', providerPlaceId: 'ward:99' } };
  expect(matchSavedPlace([MBEZI_BEACH, other], { wardName: 'mbezi beach', districtName: 'Kinondoni', regionName: 'Dar es Salaam' })).toBe(MBEZI_BEACH);
  expect(matchSavedPlace([MBEZI_BEACH], { wardName: 'Mbezi Beach', regionName: 'Arusha' })).toBeNull();
  expect(matchSavedPlace([MBEZI_BEACH, { ...MBEZI_BEACH, placeRef: { providerKey: 'x', providerPlaceId: '2' } }], { wardName: 'Mbezi Beach' })).toBeNull();
  expect(matchSavedPlace([MBEZI_BEACH], { wardName: 'Sinza' })).toBeNull();
});

test('a marketplace order: opens at the delivery check, books with the engine, ships the order (its waybill stays)', async () => {
  api.post.mockImplementation(async (url, body) => {
    if (url === '/transport/service-offers/discover') return { data: [{ serviceType: 'direct_delivery', price: 4000 }] };
    if (url === '/transport/service-offers/commit') return { data: { id: 31 } };
    if (url === '/shipments') return { data: { id: 88 } };
    if (url === '/orders/9/ship-engine') return { data: { orderId: 9, trackingNumber: 'KTX-ORD-9', customerNumber: 'KTX 0000 0000 18' } };
    return { data: {} };
  });
  render(<SellerShipment isLoggedIn onNavigate={jest.fn()} prefill={{
    orderId: 9, name: 'Neema', phone: '0754000111', region: 'Dar es Salaam', district: 'Kinondoni', ward: 'Mbezi Beach',
    items: [{ name: 'Taa ya mezani', qty: 1, price: 45000 }],
  }} />);
  expect(screen.getByText('Hatua 4 kati ya 4')).toBeTruthy();
  await screen.findByTestId('offer-direct');
  fireEvent.click(nextBtn(4));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/orders/9/ship-engine', { shipmentId: 88, confirm: {} }));
  expect(posted('/super-agents/shipments')).toEqual([]);
  expect(await screen.findByTestId('seller-send-number')).toHaveTextContent('KTX 0000 0000 18');
});
