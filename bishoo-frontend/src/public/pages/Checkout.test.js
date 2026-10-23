import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import Checkout from './Checkout';
import { CartProvider } from '../../context/CartContext';
import api from '../../api/api';
import sw from '../../locales/sw.json';

jest.mock('react-i18next', () => {
  const texts = require('../../locales/sw.json');
  return { useTranslation: () => ({ t: (key, vars) => {
    const v = key.split('.').reduce((o, k) => (o ? o[k] : undefined), texts) ?? key;
    return String(v).replace(/\{\{(\w+)\}\}/g, (_m, k) => (vars && vars[k] != null ? vars[k] : ''));
  } }) };
});
jest.mock('../../api/api', () => ({ get: jest.fn(), post: jest.fn(), patch: jest.fn() }));
jest.mock('../../utils/paymentMode', () => ({ usePaymentMode: () => 'cod_lipa' }));

/**
 * Marketplace checkout (cod_lipa): one place search sets region, district and ward;
 * the cart can be changed on the page; sold-out items leave the cart; Lipa Namba
 * creates no order before the buyer confirms with proof.
 */
const MBEYA = { placeRef: { providerKey: 'tz_seed', providerPlaceId: 'ward:401' }, displayLabel: 'Iyunga, Mbeya Mjini, Mbeya', level: 'ward', wardName: 'Iyunga', districtName: 'Mbeya Mjini', regionName: 'Mbeya' };
const ARUSHA = { placeRef: { providerKey: 'tz_seed', providerPlaceId: 'district:77' }, displayLabel: 'Arusha Mjini, Arusha', level: 'district', districtName: 'Arusha Mjini', regionName: 'Arusha' };
const ROWS = {
  'ward/401': { type: 'ward', wardId: 401, ward: 'Iyunga', districtId: 40, district: 'Mbeya Mjini', regionId: 12, region: 'Mbeya', fullAddress: 'Iyunga, Mbeya Mjini, Mbeya' },
  'district/77': { type: 'district', districtId: 77, district: 'Arusha Mjini', regionId: 2, region: 'Arusha', fullAddress: 'Arusha Mjini, Arusha' },
};
const CART = [
  { id: 31, name: 'Simu A', basePrice: 300000, displayPrice: 300000, quantity: 1, stock: 5, productType: 'physical', codEnabled: true },
  { id: 34, name: 'Saa B', basePrice: 150000, displayPrice: 150000, quantity: 2, stock: 5, productType: 'physical', codEnabled: true },
];

let stock;
function mockApi() {
  api.get.mockImplementation(async (url, config) => {
    if (url === '/location-intelligence/places') {
      const q = config.params.q.toLowerCase();
      return { data: { candidates: [MBEYA, ARUSHA].filter((c) => c.displayLabel.toLowerCase().includes(q)) } };
    }
    const place = url.match(/^\/locations\/places\/(\w+)\/(\d+)$/);
    if (place) return { data: ROWS[`${place[1]}/${place[2]}`] };
    const product = url.match(/^\/products\/(\d+)$/);
    if (product) {
      const s = stock[product[1]];
      if (s === 0) { const e = new Error('404'); e.response = { status: 404 }; throw e; }
      return { data: { id: Number(product[1]), stock: s } };
    }
    if (url === '/orders/payment-options') return { data: { options: ['lipa_namba'], sameCity: false, lipaNamba: { number: '55771234', name: 'Juma Shop' } } };
    if (url.startsWith('/orders/delivery-methods')) return { data: { methods: [], isSameCity: false } };
    return { data: {} };
  });
  api.post.mockImplementation(async (url, body) => {
    if (url === '/orders/checkout/quote') return { data: { place: body.deliveryAddress, total: 600000, sellers: [{ sellerId: 2, storeName: 'Duka', total: 600000, lipaNamba: { number: '55771234', name: 'Juma Shop' } }] } };
    return { data: {} };
  });
}

function renderCheckout(cart = CART) {
  localStorage.setItem('kentexa_cart_guest', JSON.stringify(cart));
  return render(<CartProvider><Checkout onNavigate={() => {}} currentUser={{ name: 'Asha', phone: '0712345678' }} /></CartProvider>);
}

async function pickPlace(text, label) {
  const input = screen.getByPlaceholderText(sw.checkout.place_placeholder);
  fireEvent.change(input, { target: { value: text } });
  fireEvent.focus(input);
  const option = await screen.findByText(label, { selector: 'div' }, { timeout: 2000 });
  fireEvent.click(option.closest('button'));
  await waitFor(() => expect(input).toHaveValue(label));
}

const paymentOptionCalls = () => api.get.mock.calls.filter(([u]) => u === '/orders/payment-options');

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  stock = { 31: 5, 34: 5 };
  mockApi();
});

describe('location: one keyword search', () => {
  test('typing a ward or district shows matching results', async () => {
    renderCheckout();
    fireEvent.change(screen.getByPlaceholderText(sw.checkout.place_placeholder), { target: { value: 'iyun' } });
    expect(await screen.findByText('Iyunga, Mbeya Mjini, Mbeya', {}, { timeout: 2000 })).toBeInTheDocument();
    expect(screen.queryByText('Arusha Mjini, Arusha')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull(); // no region / district / ward dropdowns
  });

  test('choosing one sets region, district and ward together, and reloads payment options', async () => {
    renderCheckout();
    await pickPlace('iyun', 'Iyunga, Mbeya Mjini, Mbeya');
    await waitFor(() => expect(paymentOptionCalls().some(([, c]) => c.params.regionId === 12)).toBe(true));
    fireEvent.click(await screen.findByTestId('pay-lipa'));
    fireEvent.click(screen.getByTestId('place-order'));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/orders/checkout/quote', expect.objectContaining({
      regionId: 12, districtId: 40, wardId: 401, deliveryAddress: 'Iyunga, Mbeya Mjini, Mbeya',
    })));
  });

  test('changing from Mbeya to Arusha replaces it everywhere', async () => {
    renderCheckout();
    await pickPlace('iyun', 'Iyunga, Mbeya Mjini, Mbeya');
    await pickPlace('arusha', 'Arusha Mjini, Arusha');
    await waitFor(() => expect(paymentOptionCalls().some(([, c]) => c.params.regionId === 2)).toBe(true));
    fireEvent.click(await screen.findByTestId('pay-lipa'));
    fireEvent.click(screen.getByTestId('place-order'));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/orders/checkout/quote', expect.anything()));
    const body = api.post.mock.calls.find(([u]) => u === '/orders/checkout/quote')[1];
    expect(body).toEqual(expect.objectContaining({ regionId: 2, districtId: 77, wardId: null, deliveryAddress: 'Arusha Mjini, Arusha' }));
    expect(JSON.stringify(body)).not.toMatch(/Mbeya|Iyunga/);
  });
});

describe('cart on the checkout page', () => {
  test('every item has a remove button and a quantity control; removing one updates the total and payment options', async () => {
    renderCheckout();
    const items = screen.getAllByTestId('checkout-item');
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByTestId('remove-31')).toHaveTextContent(sw.checkout.remove_item);
    expect(within(items[0]).getByTestId('qty-more-31')).toBeInTheDocument();
    expect(screen.getByTestId('checkout-total')).toHaveTextContent('TZS 600,000');
    await waitFor(() => expect(paymentOptionCalls().length).toBeGreaterThan(0));
    const before = paymentOptionCalls().length;
    fireEvent.click(screen.getByTestId('remove-34'));
    expect(screen.getAllByTestId('checkout-item')).toHaveLength(1);
    expect(screen.getByTestId('checkout-total')).toHaveTextContent('TZS 300,000');
    await waitFor(() => expect(paymentOptionCalls().length).toBeGreaterThan(before));
    expect(paymentOptionCalls().slice(before).every(([, c]) => c.params.productId === 31)).toBe(true);
  });

  test('the quantity control changes the total', async () => {
    renderCheckout();
    fireEvent.click(screen.getByTestId('qty-less-34'));
    expect(screen.getByTestId('checkout-total')).toHaveTextContent('TZS 450,000');
  });
});

describe('stock', () => {
  test('an item that sold out while in the cart is removed and the buyer is told which one', async () => {
    stock = { 31: 5, 34: 0 };
    renderCheckout();
    expect(await screen.findByTestId('stock-notice')).toHaveTextContent('Imeisha, imeondolewa kwenye kikapu: Saa B');
    expect(screen.getAllByTestId('checkout-item')).toHaveLength(1);
  });

  test('fewer left than in the cart: the quantity is lowered', async () => {
    stock = { 31: 5, 34: 1 };
    renderCheckout();
    expect(await screen.findByTestId('stock-notice')).toHaveTextContent('Zimebaki 1 tu za "Saa B"');
  });
});

describe('Lipa Namba: no order before confirmation', () => {
  test('the last button is "Lipa na uthibitishe"; it opens the payment step and creates nothing', async () => {
    renderCheckout();
    await pickPlace('arusha', 'Arusha Mjini, Arusha');
    fireEvent.click(await screen.findByTestId('pay-lipa'));
    expect(screen.getByTestId('place-order')).toHaveTextContent('Lipa na uthibitishe');
    fireEvent.click(screen.getByTestId('place-order'));
    expect(await screen.findByTestId('lipa-step')).toBeInTheDocument();
    expect(await screen.findByTestId('lipa-amount')).toHaveTextContent('TZS 600,000');
    expect(screen.getByTestId('lipa-namba-box')).toHaveTextContent('55771234');
    expect(api.post.mock.calls.some(([u]) => u === '/orders/checkout' || u === '/orders')).toBe(false);
  });
});

describe('buyer words', () => {
  test('no internal term in the checkout text', async () => {
    renderCheckout();
    await pickPlace('arusha', 'Arusha Mjini, Arusha');
    const text = document.body.textContent;
    expect(text).not.toMatch(/super ?agent|wakala|escrow|hub\b|waybill/i);
    const buyerKeys = ['checkout', 'direct_payment', 'cart'].flatMap((ns) => Object.entries(sw[ns]))
      .filter(([k]) => !/^(pay_agent|nearby_agents|finding_agents|no_agents|visit_agent|secure|collection|rural|urban|seller_)/.test(k));
    const offenders = buyerKeys.filter(([, v]) => /super ?agent/i.test(String(v)));
    expect(offenders).toEqual([]);
  });
});
