import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import TeamWork from './TeamWork';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn() } }));

test('Kazi shows waiting invitations and "POS ya X" for the businesses I work for (owner 2026-11-03)', async () => {
  api.get.mockImplementation(async (url) => ({ data: url === '/team-invitations/mine'
    ? [{ token: 'tok1234567890abcd', businessName: 'Duka B', roleLabel: 'mhudumu wa mauzo' }]
    : [{ sellerId: 9, commerceProfileId: 5, businessName: 'BiS', roleLabel: 'mhudumu wa mauzo', permissions: { canOperatePOS: true } }] }));
  const onNavigate = jest.fn();
  render(<TeamWork onNavigate={onNavigate} />);
  fireEvent.click(await screen.findByTestId('team-pos-9'));
  expect(onNavigate).toHaveBeenCalledWith('TeamPOS', { posTeam: expect.objectContaining({ sellerId: 9 }) });
  fireEvent.click(screen.getByTestId('team-invite-open-tok1234567890abcd'));
  expect(onNavigate).toHaveBeenCalledWith('TeamInvite-tok1234567890abcd');
});

test('nothing for a person with no invitation and no team', async () => {
  api.get.mockResolvedValue({ data: [] });
  const { container } = render(<TeamWork onNavigate={jest.fn()} />);
  await new Promise((r) => setTimeout(r, 0));
  expect(container.firstChild).toBeNull();
});
