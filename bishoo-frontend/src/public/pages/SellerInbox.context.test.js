import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import SellerInbox, { listTime, dayLabel } from './SellerInbox';
import api from '../../api/api';
import { __resetTokenStoreForTests, setAccessToken } from '../../api/tokenStore';

jest.mock('../../api/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
}));
jest.mock('../../context/SocketProvider', () => ({ useSocket: () => ({ socket: null, connected: false }) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: key => key, i18n: { language: 'sw' } }) }));
jest.mock('../components/LocationPicker', () => () => null);

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{23F3}\u{231B}]/u;
const now = new Date().toISOString();

beforeEach(() => {
  __resetTokenStoreForTests();
  setAccessToken('a-token');
  jest.clearAllMocks();
  api.get.mockImplementation((path) => {
    if (path.startsWith('/business/inbox?')) return Promise.resolve({ data: { conversations: [
      { id: 1, status: 'open', unreadCount: 2, lastMessageAt: now, lastMessagePreview: 'Bado ipo?', customer: { name: 'Asha', phone: '255713000000' } },
      { id: 3, status: 'closed', lastMessageAt: now, lastMessagePreview: 'Asante', customer: { name: 'Zamani' } },
    ] } });
    if (path.startsWith('/business/operational-inbox?')) return Promise.resolve({ data: { conversations: [{ id: 5, lastMessageAt: now, customer: { name: 'Mteja wa ofisi' } }] } });
    if (path.startsWith('/business/my-conversations?')) return Promise.resolve({ data: { conversations: [
      { id: 2, lastMessageAt: now, lastMessagePreview: 'Mnaletaje Mwanza?', commerceProfile: { displayName: 'Kisayo Store' } },
    ] } });
    if (path === '/business/inbox/1/messages') return Promise.resolve({ data: {
      conversation: { id: 1, status: 'open', customer: { name: 'Asha', phone: '255713000000' } }, hasMore: false,
      messages: [
        { id: 10, senderType: 'customer', content: 'Habari', createdAt: new Date(Date.now() - 86400000).toISOString() },
        { id: 11, senderType: 'seller', content: 'Ipo', isRead: true, createdAt: new Date(Date.now() - 86400000).toISOString() },
        { id: 12, senderType: 'customer', content: 'Bado ipo?', createdAt: now },
      ] } });
    return Promise.resolve({ data: [] });
  });
});

const paths = () => api.get.mock.calls.map(([p]) => p);

// Owner 2026-10-26: the business inbox of the active role, plus the chats this
// person started with shops ("Nimewaandikia"), in every role.
test.each([
  ['seller', '/business/inbox?'], ['admin', '/business/inbox?'], ['manager', '/business/inbox?'],
  ['service_provider', '/business/inbox?'],
  ['agent', '/business/operational-inbox?'], ['super_agent', '/business/operational-inbox?'], ['transport_provider', '/business/operational-inbox?'],
])('role "%s" loads %s and the chats it started', async (userRole, businessPath) => {
  render(<SellerInbox onNavigate={jest.fn()} userRole={userRole} currentUser={{ id: 1 }} contextEpoch={1} />);
  await waitFor(() => expect(paths().some(p => p.startsWith(businessPath))).toBe(true));
  expect(paths().some(p => p.startsWith('/business/my-conversations?'))).toBe(true);
});

test.each(['buyer', 'customer_care', 'arbitrator'])('role "%s" sees only the chats it started', async (userRole) => {
  render(<SellerInbox onNavigate={jest.fn()} userRole={userRole} currentUser={{ id: 1 }} contextEpoch={1} />);
  await waitFor(() => expect(paths().some(p => p.startsWith('/business/my-conversations?'))).toBe(true));
  expect(paths().some(p => p.startsWith('/business/inbox') || p.startsWith('/business/operational-inbox'))).toBe(false);
});

test('a seller sees customers and shops they wrote to; chips filter; archived hidden; no emoji', async () => {
  const { container } = render(<SellerInbox onNavigate={jest.fn()} userRole="seller" currentUser={{ id: 1 }} contextEpoch={1} />);
  expect(await screen.findByText('Asha')).toBeInTheDocument();
  expect(screen.getByText('Kisayo Store')).toBeInTheDocument();
  expect(screen.queryByText('Zamani')).toBeNull();            // closed = archived
  expect(within(screen.getByTestId('convo-seller-1')).getByTestId('unread-badge')).toHaveTextContent('2');

  fireEvent.click(screen.getByRole('button', { name: 'Nimewaandikia' }));
  expect(screen.queryByText('Asha')).toBeNull();
  expect(screen.getByText('Kisayo Store')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Zilizohifadhiwa' }));
  expect(screen.getByText('Zamani')).toBeInTheDocument();
  expect(EMOJI.test(container.textContent)).toBe(false);
});

test('a chat shows day separators, times and read ticks on my messages', async () => {
  render(<SellerInbox onNavigate={jest.fn()} userRole="seller" currentUser={{ id: 1 }} contextEpoch={1} />);
  fireEvent.click(await screen.findByText('Asha'));
  expect(await screen.findByText('Habari')).toBeInTheDocument();
  expect(screen.getAllByTestId('day-separator').map(n => n.textContent)).toEqual(['Jana', 'Leo']);
  expect(screen.getByRole('img', { name: 'Imesomwa' })).toBeInTheDocument();
  expect(screen.getByTestId('chat-name')).toHaveTextContent('Asha');
});

test('seller tools live behind +', async () => {
  render(<SellerInbox onNavigate={jest.fn()} userRole="seller" currentUser={{ id: 1 }} contextEpoch={1} />);
  fireEvent.click(await screen.findByText('Asha'));
  await screen.findByText('Habari');
  fireEvent.click(screen.getByRole('button', { name: 'Zana' }));
  const tools = screen.getByRole('dialog', { name: 'Zana' });
  for (const name of ['Picha', 'Tuma bidhaa', 'Tuma ankara', 'Tuma mzigo', 'Kumbukumbu ya ndani']) {
    expect(within(tools).getByRole('button', { name })).toBeInTheDocument();
  }
});

test('list times read like WhatsApp', () => {
  const d = (n) => new Date(Date.now() - n * 86400000);
  expect(listTime(d(0))).toMatch(/^\d\d:\d\d$/);
  expect(listTime(d(1))).toBe('Jana');
  expect(dayLabel(d(0))).toBe('Leo');
  expect(listTime(new Date('2025-01-05T10:00:00'))).toBe('05/01/25');
});
