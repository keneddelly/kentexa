import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import TeamInvite from './TeamInvite';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));

const VIEW = { businessName: 'BiS', commerceProfileId: 5, name: 'Asha', role: 'sales', roleLabel: 'mhudumu wa mauzo', status: 'pending', phoneMasked: '07•• ••• 678', pos: true };

beforeEach(() => { jest.clearAllMocks(); try { localStorage.clear(); } catch { /* none */ } });

test('the invited cashier sees the business and taps Kubali, then opens its POS (owner 2026-11-03)', async () => {
  api.get.mockImplementation(async (url) => (url === '/team-invitations/workplaces'
    ? { data: [{ sellerId: 9, commerceProfileId: 5, businessName: 'BiS', permissions: { canOperatePOS: true } }] } : { data: VIEW }));
  api.post.mockResolvedValue({ data: { status: 'accepted' } });
  const onNavigate = jest.fn();
  render(<TeamInvite token="abcdefghijklmnop" isLoggedIn onNavigate={onNavigate} />);
  expect(await screen.findByText('BiS')).toBeInTheDocument();
  fireEvent.click(screen.getByTestId('team-invite-accept'));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/team-invitations/abcdefghijklmnop/accept'));
  expect(await screen.findByText('Umejiunga na BiS kama mhudumu wa mauzo.')).toBeInTheDocument();
  fireEvent.click(screen.getByTestId('team-invite-open-pos'));
  await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('TeamPOS', { posTeam: expect.objectContaining({ sellerId: 9 }) }));
  expect(JSON.parse(localStorage.getItem('kx_pos_team'))).toMatchObject({ sellerId: 9, businessName: 'BiS' });
});

test('a person who is not signed in is asked to log in or register with the invited number', async () => {
  api.get.mockResolvedValue({ data: VIEW });
  const onNavigate = jest.fn();
  render(<TeamInvite token="abcdefghijklmnop" isLoggedIn={false} onNavigate={onNavigate} />);
  expect(await screen.findByText(/Ingia kwa namba 07•• ••• 678/)).toBeInTheDocument();
  fireEvent.click(screen.getByText('Jisajili'));
  expect(onNavigate).toHaveBeenCalledWith('Register');
});
