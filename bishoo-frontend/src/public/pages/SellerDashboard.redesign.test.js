import React from 'react';
import { render, screen, within } from '@testing-library/react';
import SellerDashboard, { weekBars } from './SellerDashboard';
import api from '../../api/api';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k) => k, i18n: { language: 'sw' } }) }));
jest.mock('../../api/api', () => ({ get: jest.fn(), post: jest.fn(), patch: jest.fn() }));
jest.mock('../../onboarding/FeatureTour', () => () => null);
jest.mock('../../onboarding/TourTrigger', () => () => null);
jest.mock('../components/SellerLipaNambaCard', () => () => null);
jest.mock('../components/SellerPartnerAgentsCard', () => () => null);
jest.mock('../components/ProfileCompletionBanner', () => () => null);
jest.mock('../components/PhoneNudgeBanner', () => () => null);

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{23F3}\u{231B}]/u;
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const respond = (over = {}) => (url) => {
  const map = {
    '/seller/my-profile': { status: 'approved', storeName: 'Kisayo', phone: '0712' },
    '/seller/dashboard': {
      stats: { totalOrders: 214, totalProducts: 38, activeProducts: 30, totalClassifieds: 6, needsShipping: 3 },
      totals: { toSend: 3, paidLast7Days: [{ day: ymd(new Date()), revenue: 185000, orders: 2 }] },
      recentOrders: [{ id: 9, status: 'paid', source: 'online', shippingMethod: 'agent', totalAmount: 420000, product: { name: 'Simu Samsung A15' }, createdAt: new Date().toISOString() }],
    },
    '/classifieds/invoices/seller-requests': [{ id: 1, status: 'pending' }, { id: 2, status: 'paid' }],
    '/sales/dashboard': { grossSales: 185000, today: { byChannel: { local_pos: 120000, kentexa_online: 65000 } }, lowStock: [{ id: 4, name: 'Samsung A15', stock: 1 }] },
    ...over,
  };
  if (url in map && map[url] === undefined) return Promise.reject({ response: { status: 404 } });
  return url in map ? Promise.resolve({ data: map[url] }) : Promise.reject(new Error('404'));
};

test('a busy seller: true totals, the work to do, paid money only, the latest orders, no emoji', async () => {
  api.get.mockImplementation(respond());
  const { container } = render(<SellerDashboard onNavigate={jest.fn()} isLoggedIn activeProfileId={5}
    activeProfile={{ id: 5, displayName: 'Kisayo Store', isVerified: true, location: 'Dar es Salaam' }} />);
  expect(await screen.findByTestId('dash-identity')).toHaveTextContent('Kisayo Store');
  expect(screen.getByRole('img', { name: 'Imethibitishwa' })).toBeInTheDocument();
  expect(api.get).toHaveBeenCalledWith('/classifieds/invoices/seller-requests', { params: { commerceProfileId: 5 } });
  expect(screen.getByTestId('dash-tiles')).toHaveTextContent('214');
  const todo = screen.getByTestId('dash-todo');
  expect(todo).toHaveTextContent('Maagizo 3 yanasubiri kutumwa');
  expect(todo).toHaveTextContent('Ombi 1 la ankara');
  expect(todo).toHaveTextContent('Samsung A15 imebaki 1');
  expect(screen.getByTestId('dash-week')).toHaveTextContent('TZS 185,000');
  expect(within(screen.getByTestId('dash-recent')).getByText('Imelipwa. Itume')).toBeInTheDocument();
  expect(screen.queryByTestId('verify-card')).toBeNull();
  expect(EMOJI.test(container.textContent)).toBe(false);
});

test('a new, unverified seller: the verify card, first steps, and locked tools that lead to verification', async () => {
  api.get.mockImplementation(respond({
    '/seller/dashboard': { stats: { totalOrders: 0, totalProducts: 0, totalClassifieds: 0 }, totals: { toSend: 0, paidLast7Days: [] }, recentOrders: [] },
    '/seller/my-profile': undefined,
  }));
  render(<SellerDashboard onNavigate={jest.fn()} isLoggedIn activeProfile={{ displayName: 'Asha Mwinyi' }} />);
  expect(await screen.findByTestId('verify-card')).toHaveTextContent('Thibitisha biashara yako');
  expect(screen.getByTestId('dash-start')).toHaveTextContent('Weka tangazo la kwanza');
  expect(screen.getByTestId('menu-SellerWallet')).toHaveTextContent('Thibitisha');
});

test('the week chart only ever shows paid money, one bar per day, today last', () => {
  const today = new Date(2026, 9, 27, 10);
  const bars = weekBars([{ day: '2026-10-27', revenue: 5000 }, { day: '2026-10-21', revenue: 100 }], today);
  expect(bars).toHaveLength(7);
  expect(bars[6]).toMatchObject({ label: 'Leo', revenue: 5000, today: true });
  expect(bars[0]).toMatchObject({ key: '2026-10-21', revenue: 100 });
});
