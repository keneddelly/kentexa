import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import AdminPerson, { waNumber } from './AdminPerson';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock('../components/Sidebar', () => () => null);
jest.mock('../components/ActivityList', () => () => null);

// Owner 2026-11-09: "we should attach contact on admin dashboard".
test('contact buttons: message in KenteXa, call, WhatsApp, SMS', async () => {
  api.get.mockResolvedValue({ data: { user: { id: 44, name: 'Asha', phone: '0712 345 678' }, roles: [], counts: {}, events: [] } });
  const onNavigate = jest.fn();
  render(<AdminPerson userId={44} onNavigate={onNavigate} onLogout={jest.fn()} />);
  const box = await screen.findByTestId('person-contact');
  expect(screen.getByText('Piga').closest('a')).toHaveAttribute('href', 'tel:0712 345 678');
  expect(screen.getByText('WhatsApp').closest('a')).toHaveAttribute('href', 'https://wa.me/255712345678');
  expect(box).toHaveTextContent('SMS ya simu yako');
  fireEvent.click(screen.getByTestId('person-message'));
  expect(onNavigate).toHaveBeenCalledWith('Announcements', { targetUserId: 44, targetName: 'Asha' });
  expect(waNumber('+255 755 000 111')).toBe('255755000111');
});
