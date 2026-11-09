import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AdminActivity from './AdminActivity';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn() } }));

// Owner 2026-11-09: "admin is the mirror of KenteXa": every action, who did it, and their page.
test('shows who did what, filters, and opens the person', async () => {
  api.get.mockResolvedValue({ data: { items: [
    { id: 2, eventType: 'ACTION', category: 'COMMERCE', actorId: 40, actorName: 'Baraka', actorType: 'seller', targetId: 12,
      metadata: { method: 'PATCH', route: '/orders/:id/cancel' }, createdAt: '2026-11-09T08:00:00Z' },
    { id: 1, eventType: 'MOMENT_CREATED', category: 'SOCIAL', actorId: 41, actorName: 'Asha', createdAt: '2026-11-09T07:00:00Z' },
  ], nextBefore: null } });
  const onNavigate = jest.fn();
  render(<AdminActivity activePage="AdminActivity" onNavigate={onNavigate} onLogout={jest.fn()} />);
  expect(await screen.findByTestId('event-2')).toHaveTextContent('Baraka amesitisha oda #12');
  expect(screen.getByTestId('event-1')).toHaveTextContent('Asha ameweka Moment');
  fireEvent.change(screen.getByLabelText('Eneo'), { target: { value: 'COMMERCE' } });
  await waitFor(() => expect(api.get).toHaveBeenLastCalledWith('/activity/admin/feed', { params: expect.objectContaining({ category: 'COMMERCE' }) }));
  fireEvent.click(await screen.findByText('Baraka'));
  expect(onNavigate).toHaveBeenCalledWith('AdminPerson', { userId: 40 });
});
