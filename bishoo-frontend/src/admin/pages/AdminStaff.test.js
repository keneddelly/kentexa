import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AdminStaff from './AdminStaff';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), patch: jest.fn() } }));

// Owner 2026-11-09: the admin gives staff roles by phone and can pause them.
test('give a role by phone, and pause one', async () => {
  api.get.mockResolvedValue({ data: [{ id: 6, userId: 40, name: 'Neema', phone: '0712345678', roleType: 'customer_care', status: 'active' }] });
  api.post.mockResolvedValue({ data: { id: 7 } });
  api.patch.mockResolvedValue({ data: {} });
  render(<AdminStaff activePage="AdminStaff" onNavigate={jest.fn()} onLogout={jest.fn()} />);
  expect(await screen.findByTestId('staff-6')).toHaveTextContent('Huduma kwa wateja');
  fireEvent.change(screen.getByLabelText('Simu ya mfanyakazi'), { target: { value: '0755 111 222' } });
  fireEvent.change(screen.getByLabelText('Kazi'), { target: { value: 'finance' } });
  fireEvent.click(screen.getByTestId('staff-grant'));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/admin/staff', { phone: '0755 111 222', roleType: 'finance' }));
  expect(await screen.findByRole('status')).toHaveTextContent('Fedha');
  fireEvent.click(screen.getByTestId('staff-pause-6'));
  await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/admin/staff/6', { status: 'suspended' }));
});
