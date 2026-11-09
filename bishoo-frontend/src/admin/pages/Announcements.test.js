import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Announcements from './Announcements';
import api from '../../api/api';
import { useOptionalRoleContext } from '../../context/RoleContext';

jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
jest.mock('../../context/RoleContext', () => ({ useOptionalRoleContext: jest.fn() }));
jest.mock('../components/Sidebar', () => () => null);

const sent = { id: 1, title: 'POS mpya', message: 'Madeni sasa yapo', status: 'sent', audienceLabel: 'Wauzaji', actionPage: 'POS', recipientCount: 40, openedCount: 10, createdBy: { id: 2, name: 'Meneja' } };
const waiting = { id: 2, title: 'Ofa', message: 'SMS kwa wote', status: 'pending_approval', audienceLabel: 'Wote', sendSms: true, recipientCount: 900, openedCount: 0, createdBy: { id: 2, name: 'Meneja' } };

beforeEach(() => {
  jest.useFakeTimers();
  api.get.mockReset(); api.post.mockReset();
  api.get.mockResolvedValue({ data: [sent, waiting] });
});
afterEach(() => jest.useRealTimers());

// Owner 2026-11-09: admin writes a message about a new feature with its link inside KenteXa.
test('write, see who it reaches and what SMS costs, then send with the in-app link', async () => {
  useOptionalRoleContext.mockReturnValue({ activeContext: { roleType: 'admin' }, user: { id: 9 } });
  api.post.mockImplementation((url) => Promise.resolve({ data: url.endsWith('/preview')
    ? { recipients: 120, withPhone: 100, smsParts: 1, smsCostTzs: 2200, needsApproval: false }
    : { id: 3, status: 'sent', recipientCount: 120 } }));
  render(<Announcements activePage="Announcements" onNavigate={jest.fn()} onLogout={jest.fn()} />);
  expect(await screen.findByTestId('msg-1')).toHaveTextContent('imefunguliwa na 10 (25%)');
  fireEvent.change(screen.getByLabelText('Kundi'), { target: { value: 'sellers' } });
  fireEvent.change(screen.getByLabelText(/Kichwa/), { target: { value: 'POS mpya' } });
  fireEvent.change(screen.getByLabelText(/Ujumbe/), { target: { value: 'Fungua POS uone madeni.' } });
  fireEvent.change(screen.getByLabelText('Kiungo'), { target: { value: 'POS' } });
  fireEvent.click(screen.getByLabelText(/Tuma pia SMS/));
  await act(async () => { jest.advanceTimersByTime(600); });
  expect(await screen.findByText('TZS 2,200')).toBeInTheDocument();
  expect(screen.getByTestId('msg-preview')).toHaveTextContent('Inafungua: POS ya duka');
  await act(async () => { fireEvent.click(screen.getByTestId('msg-send')); });
  expect(api.post).toHaveBeenCalledWith('/announcements/messages', expect.objectContaining({ audience: 'sellers', actionPage: 'POS', sendSms: true, title: 'POS mpya' }));
  expect(await screen.findByRole('status')).toHaveTextContent('Imetumwa kwa watu 120');
});

test('admin approves a waiting message', async () => {
  useOptionalRoleContext.mockReturnValue({ activeContext: { roleType: 'admin' }, user: { id: 9 } });
  api.post.mockResolvedValue({ data: {} });
  render(<Announcements activePage="Announcements" onNavigate={jest.fn()} onLogout={jest.fn()} />);
  const approve = await screen.findByTestId('approve-2');
  await act(async () => { fireEvent.click(approve); });
  expect(api.post).toHaveBeenCalledWith('/announcements/messages/2/approve', {});
});

test('a manager sees the waiting message but cannot approve it; the button says it goes to admin', async () => {
  useOptionalRoleContext.mockReturnValue({ activeContext: { roleType: 'manager' }, user: { id: 2 } });
  api.post.mockResolvedValue({ data: { recipients: 900, withPhone: 0, smsParts: 1, smsCostTzs: 0, needsApproval: true } });
  render(<Announcements activePage="Announcements" onNavigate={jest.fn()} onLogout={jest.fn()} />);
  await screen.findByTestId('msg-2');
  expect(screen.queryByTestId('approve-2')).toBeNull();
  expect(screen.getByTestId('msg-2')).toHaveTextContent('Sitisha');
  fireEvent.change(screen.getByLabelText(/Kichwa/), { target: { value: 'A' } });
  fireEvent.change(screen.getByLabelText(/Ujumbe/), { target: { value: 'B' } });
  await act(async () => { jest.advanceTimersByTime(600); });
  await waitFor(() => expect(screen.getByTestId('msg-send')).toHaveTextContent('Tuma kwa admin aidhinishe'));
});

test('customer care writes to one person only (opened from the person page)', async () => {
  useOptionalRoleContext.mockReturnValue({ activeContext: { roleType: 'customer_care' }, user: { id: 5 } });
  render(<Announcements activePage="Announcements" targetUserId={44} targetName="Asha" onNavigate={jest.fn()} onLogout={jest.fn()} />);
  await screen.findByTestId('msg-1');
  expect(screen.queryByLabelText('Kundi')).toBeNull();
  expect(screen.getByTestId('composer')).toHaveTextContent('Asha');
});
