import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import AdminWriters from './AdminWriters';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
jest.mock('../components/Sidebar', () => () => null);

// Writers programme #417 step B (owner approved 2026-11-18).
const rows = [
  { id: 1, name: 'Asha M', email: 'asha@mail.com', topic: 'fedha', status: 'approved', joined: false, wroteArticle: false },
  { id: 2, name: 'Juma K', email: 'juma@mail.com', status: 'sent', sentAt: '2026-11-18T08:00:00Z', joined: true, wroteArticle: true },
];
const summary = (enabled) => ({ ready: true, enabled, cap: 50, sentToday: 3, left: 47, counts: { approved: 1, sent: 1 }, joined: 1, wrote: 1 });

const setup = (enabled) => {
  api.get.mockImplementation((url) => Promise.resolve({ data: url.endsWith('/summary') ? summary(enabled) : url.endsWith('/founding') ? [] : rows }));
  api.post.mockResolvedValue({ data: { sent: 1, failed: 0, skipped: 0, left: 46 } });
};

test('while the switch is off, nothing can be sent', async () => {
  setup(false);
  await act(async () => { render(<AdminWriters activePage="AdminWriters" onNavigate={jest.fn()} onLogout={jest.fn()} />); });
  expect(screen.getByTestId('writers-switch')).toHaveTextContent('WRITER_OUTREACH_ENABLED');
  expect(screen.getByTestId('writers-send')).toBeDisabled();
});

test('admin picks the approved ones and sends; joined and article are shown', async () => {
  setup(true);
  await act(async () => { render(<AdminWriters activePage="AdminWriters" onNavigate={jest.fn()} onLogout={jest.fn()} />); });
  expect(screen.getAllByTestId('writer-row')[1]).toHaveTextContent('Ameandika makala');
  await act(async () => { fireEvent.click(screen.getByText('Chagua walio tayari')); });
  await act(async () => { fireEvent.click(screen.getByTestId('writers-send')); });
  expect(api.post).toHaveBeenCalledWith('/writer-outreach/admin/send', { ids: [1] });
  expect(screen.getByRole('status')).toHaveTextContent('Zimetumwa 1');
});

test('admin adds a writer by hand', async () => {
  setup(true);
  await act(async () => { render(<AdminWriters activePage="AdminWriters" onNavigate={jest.fn()} onLogout={jest.fn()} />); });
  fireEvent.change(screen.getByTestId('writer-name'), { target: { value: 'Neema' } });
  fireEvent.change(screen.getByTestId('writer-email'), { target: { value: 'neema@mail.com' } });
  await act(async () => { fireEvent.click(screen.getByTestId('writer-add')); });
  expect(api.post).toHaveBeenCalledWith('/writer-outreach/admin', expect.objectContaining({ name: 'Neema', email: 'neema@mail.com' }));
});

test('Founding Contributor is given by @username', async () => {
  setup(true);
  await act(async () => { render(<AdminWriters activePage="AdminWriters" onNavigate={jest.fn()} onLogout={jest.fn()} />); });
  await act(async () => { fireEvent.click(screen.getByTestId('admin-writers-tab-founding')); });
  fireEvent.change(screen.getByTestId('founding-username'), { target: { value: '@asha' } });
  await act(async () => { fireEvent.click(screen.getByTestId('founding-add')); });
  expect(api.post).toHaveBeenCalledWith('/writer-outreach/admin/founding', { username: '@asha', note: '' });
});
