import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import SendShipment, { completeOffers, journeySteps } from './SendShipment';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ get: jest.fn(), post: jest.fn(), patch: jest.fn() }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k) => k }) }));

const place = (id, label, region, district) => ({
  displayLabel: label, regionName: region, districtName: district,
  placeRef: { providerKey: 'tz_seed', providerPlaceId: id },
});
const KARIAKOO = place('ward:6', 'Kariakoo, Ilala, Dar es Salaam', 'Dar es Salaam', 'Ilala');
const MBAGALA = place('ward:20', 'Mbagala, Temeke, Dar es Salaam', 'Dar es Salaam', 'Temeke');
const MBEYA = place('district:90', 'Mbeya Mjini, Mbeya', 'Mbeya', 'Mbeya Mjini');

const user = { name: 'Baraka', phone: '0713000002' };

function places(map) {
  api.get.mockImplementation((url, { params }) => {
    if (url === '/location-intelligence/places') return Promise.resolve({ data: { candidates: map[params.q] ? [map[params.q]] : [] } });
    return Promise.reject(new Error(`unexpected ${url}`));
  });
}

async function pick(id, text, label) {
  fireEvent.change(document.getElementById(id), { target: { value: text } });
  fireEvent.click(await screen.findByRole('option', { name: label }));
}

async function fillSteps1and2(to, toLabel, toText) {
  fireEvent.change(screen.getByLabelText('Maelezo ya mzigo'), { target: { value: 'Nguo' } });
  fireEvent.change(screen.getByLabelText('Uzito (kg)'), { target: { value: '2' } });
  expect(screen.getByTestId('next-1').disabled).toBe(true);                 // the value is required
  fireEvent.change(screen.getByLabelText('Thamani ya mzigo'), { target: { value: '150000' } });
  expect(screen.getByLabelText('Thamani ya mzigo').value).toBe('150,000');
  fireEvent.click(screen.getByRole('radio', { name: 'Kinavunjika' }));
  fireEvent.click(screen.getByTestId('next-1'));

  expect(await screen.findByText('Hatua 2 kati ya 5')).toBeTruthy();
  await pick('kutoka', 'Kariakoo', KARIAKOO.displayLabel);
  await pick('kwenda', toText, toLabel);
  fireEvent.change(screen.getByLabelText('Jina'), { target: { value: 'Amina Juma' } });
  fireEvent.change(screen.getByLabelText('Simu ya mpokeaji'), { target: { value: '0712000222' } });
  fireEvent.click(screen.getByTestId('next-2'));
}

beforeEach(() => { api.get.mockReset(); api.post.mockReset(); api.patch.mockReset(); window.scrollTo = jest.fn(); });

test('five steps in Swahili, no emoji; logged out asks to log in', () => {
  const { unmount } = render(<SendShipment isLoggedIn={false} onNavigate={jest.fn()} />);
  expect(screen.getByText('Ingia kwanza ili kutuma mzigo.')).toBeTruthy();
  unmount();
  const { container } = render(<SendShipment isLoggedIn currentUser={user} onNavigate={jest.fn()} />);
  expect(screen.getByText('Hatua 1 kati ya 5')).toBeTruthy();
  expect(screen.getByText('Unatuma nini?')).toBeTruthy();
  expect(/\p{Extended_Pictographic}/u.test(container.textContent)).toBe(false);
});

test('same city: door to door by an agent, the agent fee is the total, then the journey with the next step', async () => {
  places({ Kariakoo: KARIAKOO, Mbagala: MBAGALA });
  api.post.mockImplementation((url, body) => {
    if (url === '/transport/service-offers/discover') {
      expect(body).toMatchObject({ fromCity: 'Dar es Salaam', toCity: 'Dar es Salaam', pickup: 'door', delivery: 'door' });
      return Promise.resolve({ data: [{ serviceType: 'direct_delivery', price: 4000, etaLabel: 'Same day' }] });
    }
    if (url === '/transport/service-offers/commit') {
      expect(body.serviceType).toBe('direct_delivery');
      expect(body.cargoRequirements).toMatchObject({ declaredValue: 150000, fragile: true, cargoClass: 'normal', quantity: 1 });
      return Promise.resolve({ data: { id: 900 } });
    }
    if (url === '/shipments') return Promise.resolve({ data: { id: 55 } });
    return Promise.reject(new Error(`unexpected ${url}`));
  });
  api.patch.mockResolvedValue({ data: { shipment: { trackingNumber: 'KTX-SHP-55' }, parcel: { waybillNumber: 'KTX7288804599' },
    nextAction: { type: 'agent_pickup', agentsAlerted: 2 } } });

  render(<SendShipment isLoggedIn currentUser={user} onNavigate={jest.fn()} />);
  await fillSteps1and2(MBAGALA, MBAGALA.displayLabel, 'Mbagala');

  expect(await screen.findByText('Hatua 3 kati ya 5')).toBeTruthy();
  expect(screen.queryByTestId('start-office')).toBeNull();                  // same city: no office choice
  expect(screen.getByTestId('next-3').disabled).toBe(true);                 // the landmark is required for door pickup
  fireEvent.change(screen.getByTestId('pickup-pin-fields').querySelector('input, textarea'), { target: { value: 'Duka la bluu, mtaa wa Msimbazi' } });
  fireEvent.click(screen.getByTestId('next-3'));

  expect(await screen.findByTestId('direct-option')).toBeTruthy();
  expect(within(screen.getByTestId('direct-option')).getByText('TZS 4,000')).toBeTruthy();
  fireEvent.click(screen.getByTestId('next-4'));

  expect(await screen.findByText('Angalia kabla ya kutuma')).toBeTruthy();
  expect(screen.getByTestId('bill-total').textContent).toBe('TZS 4,000');
  fireEvent.click(screen.getByTestId('confirm'));

  expect(await screen.findByText('Mzigo umetumwa')).toBeTruthy();
  expect(screen.getByTestId('waybill').textContent).toMatch(/KTX/);
  expect(screen.getByTestId('next-step').textContent).toMatch(/^Hatua inayofuata: Wakala wa karibu ameshaarifiwa/);
});

test('other city: only complete, bookable offers, each provider once, cheapest first; office choice; fare is the total', async () => {
  places({ Kariakoo: KARIAKOO, Mbeya: MBEYA });
  const offer = (providerId, routeId, price, runId, extra = {}) => ({
    serviceType: 'composed_intercity', price, etaLabel: 'About 12 hours linehaul',
    fulfillmentStatus: { pickup: 'included', delivery: 'included' },
    fulfillment: { transportOption: { providerId, routeId, runId, providerName: `Ofisi ${providerId}`,
      destinationPoints: [{ hubId: 7, name: 'Ofisi Mbeya' }], ...extra } },
  });
  api.post.mockImplementation((url, body) => {
    if (url === '/transport/service-offers/discover') {
      expect(body).toMatchObject({ toCity: 'Mbeya', pickup: 'point', delivery: 'collect' });
      return Promise.resolve({ data: [
        offer(1, 11, 20000, 101), offer(1, 12, 15000, 102),                   // same provider twice: cheaper one kept
        offer(2, 21, 18000, null),                                           // no trip: cannot be booked
        offer(3, 31, 12000, 301, { originPoints: [{ hubId: 5, name: 'Ofisi Kariakoo' }] }),
      ] });
    }
    if (url === '/transport/service-offers/commit') return Promise.resolve({ data: { id: 900 } });
    if (url === '/transport/quotes') return Promise.resolve({ data: { id: 700 } });
    if (url === '/transport/quotes/700/accept') return Promise.resolve({ data: { id: 700, totalAmount: 12000 } });
    if (url === '/shipments') return Promise.resolve({ data: { id: 56 } });
    return Promise.reject(new Error(`unexpected ${url}`));
  });
  api.patch.mockResolvedValue({ data: { shipment: { trackingNumber: 'KTX-SHP-56' }, parcel: { waybillNumber: 'KTX7288804600' },
    nextAction: { type: 'customer_dropoff' } } });

  render(<SendShipment isLoggedIn currentUser={user} onNavigate={jest.fn()} />);
  await fillSteps1and2(MBEYA, MBEYA.displayLabel, 'Mbeya');

  expect(await screen.findByText('Hatua 3 kati ya 5')).toBeTruthy();
  fireEvent.click(screen.getByTestId('start-office'));
  expect(screen.getByTestId('end-office').getAttribute('aria-checked')).toBe('true'); // other city: collect at the office by default
  fireEvent.click(screen.getByTestId('next-3'));

  const cards = await screen.findAllByTestId('offer');
  expect(cards.map((c) => within(c).getAllByText(/^Ofisi \d$/)[0].textContent)).toEqual(['Ofisi 3', 'Ofisi 1']);
  expect(screen.getByText('Ofa 2 zinazoweza kufanya yote')).toBeTruthy();
  expect(screen.queryByText(/Request quote|pending/i)).toBeNull();
  // The cheapest is chosen; it has one office each side, picked by itself.
  expect(screen.getByLabelText('Ofisi utakayopeleka mzigo').value).toBe('5');
  expect(screen.getByLabelText('Ofisi ya kuchukulia Mbeya Mjini').value).toBe('7');
  fireEvent.click(screen.getByTestId('next-4'));

  expect(await screen.findByTestId('bill-total')).toBeTruthy();
  expect(screen.getByTestId('bill-total').textContent).toBe('TZS 12,000');
  fireEvent.click(screen.getByTestId('confirm'));
  await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/shipments/56/confirm-and-activate', expect.objectContaining({ originHubId: 5, destinationHubId: 7 })));
  expect(await screen.findByTestId('next-step')).toBeTruthy();
  expect(screen.getByTestId('next-step').textContent).toMatch(/Peleka mzigo ofisini/);
});

test('a door leg with no agent there is not "complete": that offer is hidden', () => {
  const offers = [
    { serviceType: 'composed_intercity', price: 9000, fulfillmentStatus: { pickup: 'pending', delivery: 'included' },
      fulfillment: { transportOption: { providerId: 1, routeId: 1, runId: 1 } } },
    { serviceType: 'composed_intercity', price: 9500, fulfillmentStatus: { pickup: 'separate', delivery: 'included' },
      fulfillment: { transportOption: { providerId: 2, routeId: 2, runId: 2 } } },
  ];
  expect(completeOffers(offers, { pickupOption: 'door', deliveryOption: 'station' }).map((o) => o.providerId)).toEqual([2]);
  expect(completeOffers(offers, { pickupOption: 'station', deliveryOption: 'station' }).map((o) => o.providerId)).toEqual([2, 1].sort());
});

test('the journey shows only the steps of this trip', () => {
  const direct = journeySteps({ direct: true, pickupOption: 'door', deliveryOption: 'door', receiverName: 'Amina', nextAction: { type: 'agent_pickup', agentsAlerted: 0 } });
  expect(direct.steps.map((s) => s.text)).toEqual(['Ombi limepokelewa', 'Wakala anachukua mzigo kwako', 'Amina anapokea mzigo mlangoni kwa namba ya siri']);
  expect(direct.next).toMatch(/Hakuna wakala aliye mtandaoni/);
  const far = journeySteps({ direct: false, pickupOption: 'station', deliveryOption: 'station', providerName: 'Ofisi B', destinationLabel: 'Mbeya', receiverName: 'Amina' });
  expect(far.steps).toHaveLength(4);
  expect(far.steps[2].text).toBe('Ofisi B anausafirisha kwenda Mbeya');
});
