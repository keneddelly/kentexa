import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import AdminChats from './AdminChats';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
jest.mock('../components/Sidebar', () => () => null);

// Owner 2026-11-09: "kentexa should see what is chatting between users" (admin reads all chats).
test('list of chats, then one chat with all its messages and both people', async () => {
  api.get.mockImplementation((url) => Promise.resolve({ data: url === '/activity/admin/chats'
    ? { items: [{ id: 5, customerName: 'Asha', sellerName: 'BIS', sellerId: 7, lastMessagePreview: 'Bei gani?', messageCount: 2, channel: 'kentexa' }], nextBefore: null }
    : { conversation: { id: 5, customerName: 'Asha', customerUserId: 40, sellerName: 'BIS', sellerId: 7, channel: 'kentexa', linkedOrderId: 12 },
        messages: [{ id: 1, senderType: 'customer', content: 'Bei gani?' }, { id: 2, senderType: 'seller', content: 'TZS 20,000', isNote: false }, { id: 3, senderType: 'seller', content: 'Mteja mzuri', isNote: true }] } }));
  const onNavigate = jest.fn();
  render(<AdminChats onNavigate={onNavigate} onLogout={jest.fn()} userId={40} />);
  expect(api.get).toHaveBeenCalledWith('/activity/admin/chats', { params: { q: undefined, userId: 40, before: undefined } });
  fireEvent.click(await screen.findByTestId('chat-5'));
  expect(await screen.findByTestId('message-2')).toHaveTextContent('TZS 20,000');
  expect(screen.getByTestId('message-3')).toHaveTextContent('Maelezo ya ndani ya biashara');
  expect(screen.getByTestId('chat-thread')).toHaveTextContent('Oda #12');
  fireEvent.click(screen.getByText('Asha', { selector: 'button' }));
  expect(onNavigate).toHaveBeenCalledWith('AdminPerson', { userId: 40 });
});
