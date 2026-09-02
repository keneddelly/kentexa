import React from 'react';
import { render, waitFor } from '@testing-library/react';
import SellerInbox from './SellerInbox';
import api from '../../api/api';
import { __resetTokenStoreForTests, setAccessToken } from '../../api/tokenStore';
import { io } from 'socket.io-client';

jest.mock('../../api/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
}));
jest.mock('socket.io-client', () => ({ io: jest.fn() }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: key => key, i18n: { language: 'en' } }) }));

const socket = () => ({ on: jest.fn(), emit: jest.fn(), disconnect: jest.fn() });

beforeEach(() => {
  __resetTokenStoreForTests();
  jest.clearAllMocks();
  api.get.mockImplementation((path) => {
    if (path.startsWith('/business/inbox')) return Promise.resolve({ data: { conversations: [] } });
    if (path.startsWith('/business/my-conversations')) return Promise.resolve({ data: { conversations: [] } });
    return Promise.resolve({ data: [] });
  });
  io.mockImplementation(() => socket());
});

test('context epoch disconnects the old socket and reconnects with the new token', async () => {
  setAccessToken('transport-token');
  const props = { onNavigate: jest.fn(), userRole: 'transport_provider', currentUser: { id: 2 }, contextEpoch: 1 };
  const view = render(<SellerInbox {...props} />);
  await waitFor(() => expect(io).toHaveBeenCalledTimes(1));
  const oldSocket = io.mock.results[0].value;
  expect(io.mock.calls[0][1].auth.token).toBe('transport-token');

  setAccessToken('seller-token');
  view.rerender(<SellerInbox {...props} userRole="seller" contextEpoch={2} activeProfileId={21} />);
  await waitFor(() => expect(io).toHaveBeenCalledTimes(2));
  expect(oldSocket.disconnect).toHaveBeenCalledTimes(1);
  expect(io.mock.calls[1][1].auth.token).toBe('seller-token');
});
