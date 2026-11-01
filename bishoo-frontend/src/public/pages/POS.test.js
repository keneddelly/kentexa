import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import api from '../../api/api';
import POS, { payTotals, receiptText } from './POS';
import { listQueue, enqueueSale, __resetPosOfflineForTests, saveCatalog, saveSession } from '../../utils/posOffline';

jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
jest.mock('../components/BackBar', () => ({ title }) => <div>{title}</div>);
jest.mock('../../onboarding/FeatureTour', () => () => null);
jest.mock('../../onboarding/TourTrigger', () => () => null);
jest.mock('../utils/isAppleMobile', () => ({ isAppleMobile: () => true }));

const PRODUCTS = [
  { id: 1, name: 'Sukari 1kg', displayPrice: 3200, stock: 48, isActive: true, availableInStore: true, barcode: '600123' },
  { id: 2, name: 'Maji 1.5L', displayPrice: 1000, stock: 2, isActive: true, availableInStore: true },
];
const CTX = { userId: 70, accountRoleId: 7, roleType: 'seller', displayName: 'BIS Store' };

beforeEach(() => {
  jest.clearAllMocks();
  __resetPosOfflineForTests();
  try { localStorage.clear(); } catch { /* none */ }
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => true });
  api.get.mockImplementation((url) => Promise.resolve(url === '/products/my/products' ? { data: PRODUCTS } : { data: { today: { total: 50000 } } }));
});

test('split payment: change only comes out of cash; WhatsApp receipt text', () => {
  expect(payTotals(13200, [{ method: 'cash', amount: '10000' }, { method: 'mpesa', amount: '3200' }])).toMatchObject({ paid: 13200, left: 0, change: 0 });
  expect(payTotals(13200, [{ method: 'cash', amount: '15000' }])).toMatchObject({ left: 0, change: 1800, overNonCash: false });
  expect(payTotals(13200, [{ method: 'mpesa', amount: '15000' }])).toMatchObject({ overNonCash: true });
  expect(receiptText({ shopName: 'BIS Store', receiptNumber: 'R-1', cashier: 'Asha', items: [{ name: 'Sukari', quantity: 2, unitPrice: 3200 }],
    total: 6400, payments: [{ method: 'mpesa', amount: 6400 }], balanceDue: 0, change: 0 })).toContain('M-Pesa TZS 6,400');
});

test('online: a split payment goes to the server with its own id and both parts', async () => {
  api.post.mockResolvedValue({ data: { id: 9, receiptNumber: 'R-9', balanceDue: 0, items: [] } });
  render(<POS onNavigate={jest.fn()} activeContext={CTX} currentUser={{ name: 'Asha' }} />);
  fireEvent.click(await screen.findByTestId('pos-product-1'));
  fireEvent.click(screen.getByTestId('pos-product-1'));
  fireEvent.click(screen.getByTestId('pos-product-2'));
  expect(screen.getByTestId('pos-total')).toHaveTextContent('TZS 7,400');
  fireEvent.click(screen.getByTestId('pos-pay'));
  fireEvent.change(screen.getByTestId('pos-amount-0'), { target: { value: '5000' } });
  expect(screen.getByTestId('pos-pay-state')).toHaveTextContent('Bado TZS 2,400');
  fireEvent.click(screen.getByTestId('pos-add-method'));
  expect(screen.getByTestId('pos-pay-state')).toHaveTextContent('Imelipwa yote');
  fireEvent.click(screen.getByTestId('pos-confirm'));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/sales', expect.objectContaining({
    channel: 'local_pos', amountPaid: 7400,
    payments: [{ method: 'cash', amount: 5000 }, { method: 'mpesa', amount: 2400 }],
    clientSaleId: expect.stringMatching(/^[0-9a-f-]{36}$/),
  })));
  expect(await screen.findByTestId('pos-receipt')).toHaveTextContent('Risiti R-9');
});

test('Deni needs the customer and leaves the rest owed', async () => {
  api.post.mockResolvedValue({ data: { id: 10, receiptNumber: 'R-10', balanceDue: 1200, items: [] } });
  render(<POS onNavigate={jest.fn()} activeContext={CTX} currentUser={{ name: 'Asha' }} />);
  fireEvent.click(await screen.findByTestId('pos-product-1'));
  fireEvent.click(screen.getByTestId('pos-pay'));
  fireEvent.change(screen.getByTestId('pos-amount-0'), { target: { value: '2000' } });
  fireEvent.click(screen.getByTestId('pos-credit'));
  fireEvent.click(screen.getByTestId('pos-confirm'));
  expect(await screen.findByRole('alert')).toHaveTextContent('jina na simu');
  fireEvent.change(screen.getAllByLabelText('Jina la mteja')[0], { target: { value: 'Neema' } });
  fireEvent.change(screen.getAllByLabelText('Simu ya mteja')[0], { target: { value: '0712345678' } });
  fireEvent.click(screen.getByTestId('pos-confirm'));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/sales', expect.objectContaining({ credit: true, amountPaid: 2000, customerName: 'Neema' })));
  expect(await screen.findByTestId('pos-receipt')).toHaveTextContent('Deni');
});

test('without internet: the sale is kept on this computer, then sent once the internet is back', async () => {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => false });
  await saveCatalog([{ id: 1, name: 'Sukari 1kg', price: 3200, stock: 48 }]);
  render(<POS onNavigate={jest.fn()} activeContext={CTX} currentUser={{ name: 'Asha' }} />);
  expect(await screen.findByTestId('pos-network')).toHaveTextContent('Hakuna mtandao');
  fireEvent.click(await screen.findByTestId('pos-product-1'));
  fireEvent.click(screen.getByTestId('pos-pay'));
  fireEvent.click(screen.getByTestId('pos-confirm'));
  expect(await screen.findByText('Imehifadhiwa kwenye kompyuta hii')).toBeInTheDocument();
  expect(api.post).not.toHaveBeenCalled();
  const q = await listQueue();
  expect(q).toHaveLength(1);
  expect(q[0]).toMatchObject({ userId: 70, accountRoleId: 7, body: expect.objectContaining({ amountPaid: 3200, soldAt: expect.any(String) }) });
  expect(screen.getByTestId('pos-queue')).toHaveTextContent('Mauzo 1 yanasubiri kutumwa');

  api.post.mockResolvedValue({ data: { id: 11, receiptNumber: 'R-11' } });
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => true });
  window.dispatchEvent(new Event('online'));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/sales', expect.objectContaining({ clientSaleId: q[0].clientSaleId })));
  await waitFor(async () => expect(await listQueue()).toHaveLength(0));
});

test('a waiting sale of another account or role is never sent from this session', async () => {
  await enqueueSale({ clientSaleId: '3f2b8c1e-9a4d-4c6b-8e2f-1a2b3c4d5e6f', createdAt: new Date().toISOString(), body: { amountPaid: 1 }, userId: 99, accountRoleId: 1, summary: { total: 1 } });
  render(<POS onNavigate={jest.fn()} activeContext={CTX} currentUser={{ name: 'Asha' }} />);
  await screen.findByTestId('pos-product-1');
  await new Promise((r) => setTimeout(r, 20));
  expect(api.post).not.toHaveBeenCalled();
});

test('opened offline as the installed till: the saved products and the shop name, nothing sent', async () => {
  saveSession({ userId: 70, accountRoleId: 7, shopName: 'BIS Store', cashier: 'Asha' });
  await saveCatalog([{ id: 1, name: 'Sukari 1kg', price: 3200, stock: 48 }]);
  render(<POS onNavigate={jest.fn()} offlineBoot />);
  expect(await screen.findByTestId('pos-product-1')).toHaveTextContent('Sukari 1kg');
  expect(screen.getByText('BIS Store')).toBeInTheDocument();
  expect(api.get).not.toHaveBeenCalled();
});

test('Weka kando keeps the cart aside and brings it back', async () => {
  render(<POS onNavigate={jest.fn()} activeContext={CTX} currentUser={{ name: 'Asha' }} />);
  fireEvent.click(await screen.findByTestId('pos-product-1'));
  fireEvent.click(screen.getByTestId('pos-park'));
  expect(await screen.findByTestId('pos-parked')).toHaveTextContent('Kando · 1');
  expect(screen.getByTestId('pos-total')).toHaveTextContent('TZS 0');
  fireEvent.click(screen.getByTestId('pos-parked'));
  fireEvent.click(await screen.findByText(/Mteja · vitu 1/));
  await waitFor(() => expect(screen.getByTestId('pos-total')).toHaveTextContent('TZS 3,200'));
});
