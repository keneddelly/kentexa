import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import api from '../../api/api';
import HotelMenu from './HotelMenu';
import HotelKitchen from './HotelKitchen';
import HotelMenuManager from './HotelMenuManager';
import FoodOrder from './FoodOrder';
import { parseMenuPath, foodPaymentOptions, menuLink } from '../../utils/food';

jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() } }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key) => key }) }));
jest.mock('../components/BackBar', () => ({ title, right }) => <div><span>{title}</span>{right}</div>);

const MENU = {
  hotel: { businessId: 9, name: 'Hoteli Amani', ownerId: 70, commerceProfileId: 31, isVerified: true, area: 'Sinza, Dar es Salaam', phone: '0712000000' },
  settings: { acceptingOrders: true, dineIn: true, pickup: true, payAfterDineIn: true, codPickup: true, tableCount: 12, roomCount: 0,
    openingHours: null, lipaNamba: '5512345', lipaNambaName: 'AMANI' },
  sections: [{ name: 'Mchana', items: [
    { id: 1, name: 'Pilau ya nyama', price: 7000, availableToday: true },
    { id: 4, name: 'Kuku wa kuchoma', price: 9000, availableToday: false },
  ] }],
};

beforeEach(() => { jest.clearAllMocks(); try { sessionStorage.clear(); } catch { /* none */ } });

test('the QR link opens the menu with the table, and the rules for paying match the server', () => {
  expect(parseMenuPath('/menu/9', '?meza=4')).toEqual({ page: 'HotelMenu-9', navParams: { placeType: 'table', placeNumber: 4 } });
  expect(parseMenuPath('/menu/9/', '?chumba=12')).toEqual({ page: 'HotelMenu-9', navParams: { placeType: 'room', placeNumber: 12 } });
  expect(parseMenuPath('/store/9', '')).toBeNull();
  expect(menuLink(9, 'table', 4, 'https://kentexa.co.tz')).toBe('https://kentexa.co.tz/menu/9?meza=4');
  expect(foodPaymentOptions(MENU.settings, 'dine_in')).toEqual(['lipa_namba', 'pay_after']);
  expect(foodPaymentOptions(MENU.settings, 'pickup')).toEqual(['lipa_namba', 'cod']);
});

test('customer: menu from QR, sold-out dish cannot be added, order goes to the kitchen with table 4', async () => {
  api.get.mockResolvedValue({ data: MENU });
  api.post.mockResolvedValue({ data: { id: 412 } });
  const onNavigate = jest.fn();
  render(<HotelMenu businessId={9} placeType="table" placeNumber={4} onNavigate={onNavigate} isLoggedIn />);
  expect(await screen.findByText('Hoteli Amani')).toBeInTheDocument();
  expect(screen.getByTestId('food-qr-place')).toHaveTextContent('Meza namba 4.');
  expect(screen.getByText('Imeisha leo')).toBeInTheDocument();
  expect(screen.queryByTestId('food-add-4')).toBeNull();
  fireEvent.click(screen.getByTestId('food-add-1'));
  fireEvent.click(screen.getByTestId('food-add-1'));
  fireEvent.click(screen.getByTestId('food-cart-bar'));
  expect(screen.getByTestId('food-total')).toHaveTextContent('TZS 14,000');
  expect(screen.getByTestId('food-place-number')).toHaveValue(4);
  expect(screen.getByTestId('food-lipa-namba')).toHaveTextContent('5512345');
  fireEvent.click(screen.getByTestId('food-pay-pay_after'));
  fireEvent.click(screen.getByTestId('food-place-order'));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/food/orders', expect.objectContaining({
    businessId: 9, mode: 'dine_in', placeType: 'table', placeNumber: 4, paymentMethod: 'pay_after', items: [{ itemId: 1, qty: 2 }],
  })));
  await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('FoodOrder-412'));
});

test('customer: the waiting time shown is the one the kitchen chose', async () => {
  api.get.mockResolvedValue({ data: { id: 412, code: 'H-0412', businessId: 9, mode: 'dine_in', placeType: 'table', placeNumber: 4, place: 'Meza 4',
    status: 'cooking', readyInMinutes: 20, items: [{ itemId: 1, name: 'Pilau ya nyama', price: 7000, qty: 2 }], total: 14000,
    paymentMethod: 'pay_after', paymentStatus: 'pending', createdAt: new Date().toISOString(), hotel: { name: 'Hoteli Amani', ownerId: 70 } } });
  render(<FoodOrder orderId={412} onNavigate={jest.fn()} isLoggedIn />);
  expect(await screen.findByTestId('food-status')).toHaveTextContent('Inapikwa');
  expect(screen.getByText('Jikoni wamesema: tayari baada ya dakika 20.')).toBeInTheDocument();
  expect(screen.getByTestId('food-payment')).toHaveTextContent('Utalipa ukimaliza kula');
});

test('kitchen: accept with the chosen minutes, and confirm a Lipa Namba payment', async () => {
  const now = new Date().toISOString();
  api.get.mockResolvedValue({ data: { hotel: { name: 'Hoteli Amani' }, acceptingOrders: true, hasMenu: true,
    today: { orders: 3, sales: 41000, toConfirm: 1 },
    orders: [
      { id: 412, code: 'H-0412', status: 'new', mode: 'dine_in', place: 'Meza 4', items: [{ itemId: 1, name: 'Pilau ya nyama', qty: 1 }], total: 7000,
        paymentMethod: 'lipa_namba', paymentStatus: 'proof_sent', proofUrl: 'https://x/proof', createdAt: now },
    ] } });
  api.post.mockResolvedValue({ data: { id: 412, status: 'cooking' } });
  render(<HotelKitchen businessId={9} onNavigate={jest.fn()} isLoggedIn />);
  expect(await screen.findByTestId('kitchen-ticket-412')).toHaveTextContent('Meza 4');
  expect(screen.getByText('TZS 41,000')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('radio', { name: 'dk 30' }));
  fireEvent.click(screen.getByTestId('kitchen-accept-412'));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/food/hotel/9/orders/412/accept', { minutes: 30 }));
  await waitFor(() => expect(screen.getByTestId('kitchen-confirm-pay-412')).not.toBeDisabled());
  fireEvent.click(screen.getByTestId('kitchen-confirm-pay-412'));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/food/hotel/9/orders/412/confirm-payment', {}));
});

test('menu manager: "kipo leo" switch and the hotel allowing cash on pickup', async () => {
  api.get.mockImplementation((url) => Promise.resolve(url.endsWith('/settings')
    ? { data: { hotel: { name: 'Hoteli Amani' }, settings: { ...MENU.settings, enabled: true, codPickup: false }, lipaNamba: '5512345' } }
    : { data: [{ id: 1, name: 'Pilau ya nyama', section: 'Mchana', price: 7000, availableToday: true }] }));
  api.patch.mockImplementation((url, body) => Promise.resolve(url.includes('/items/')
    ? { data: [{ id: 1, name: 'Pilau ya nyama', section: 'Mchana', price: 7000, availableToday: false }] }
    : { data: { hotel: { name: 'Hoteli Amani' }, settings: { ...MENU.settings, ...body } } }));
  render(<HotelMenuManager businessId={9} onNavigate={jest.fn()} isLoggedIn />);
  fireEvent.click(await screen.findByTestId('food-today-1'));
  await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/food/hotel/9/items/1', { availableToday: false }));
  expect(await screen.findByText('Imeisha leo')).toBeInTheDocument();
  await waitFor(() => expect(screen.getByTestId('food-setting-codPickup')).not.toBeDisabled());
  fireEvent.click(screen.getByTestId('food-setting-codPickup'));
  await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/food/hotel/9/settings', expect.objectContaining({ codPickup: true })));
});

test('hotel screens never guess a business', () => {
  render(<HotelKitchen onNavigate={jest.fn()} isLoggedIn activeContext={{ identityType: 'PERSONAL' }} />);
  expect(screen.getByText('Fungua ukurasa huu kutoka kwenye biashara yako.')).toBeInTheDocument();
});
