import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SellerAgentInvite from './SellerAgentInvite';
import api from '../../api/api';
import { destinationForPage, DESTINATION_KIND } from '../../navigation/destinationRegistry';

jest.mock('../../api/api', () => ({ get: jest.fn(), post: jest.fn() }));

const TOKEN = 'eyJuIjoieCJ9.c2lnbmF0dXJl';
const summary = { status: 'opened', invitedName: 'Juma', shopName: 'BIS' };

beforeEach(() => { api.get.mockReset(); api.post.mockReset(); });

test('the seller agent invitation link is a public destination', () => {
  expect(destinationForPage(`SellerAgentInvite-${TOKEN}`)).toEqual(expect.objectContaining({ kind: DESTINATION_KIND.PUBLIC }));
  expect(destinationForPage('SellerAgentInvite-abc')).toBeNull();
});

test('names the inviting shop; logged out, joining goes to login first', async () => {
  api.get.mockResolvedValue({ data: summary });
  const onNavigate = jest.fn();
  render(<SellerAgentInvite token={TOKEN} isLoggedIn={false} onNavigate={onNavigate} />);
  expect(await screen.findByText('BIS anakualika uwe wakala wake KenteXa')).toBeTruthy();
  expect(api.get).toHaveBeenCalledWith(`/seller-agent-partners/link/${TOKEN}`);
  fireEvent.click(screen.getByRole('button'));
  expect(onNavigate).toHaveBeenCalledWith('PublicLogin');
  expect(api.post).not.toHaveBeenCalled();
});

test('logged in and not yet an agent: accept, then the normal agent application', async () => {
  api.get.mockResolvedValue({ data: summary });
  api.post.mockResolvedValue({ data: { status: 'accepted', next: 'apply', shopName: 'BIS' } });
  const onNavigate = jest.fn();
  render(<SellerAgentInvite token={TOKEN} isLoggedIn onNavigate={onNavigate} />);
  fireEvent.click(await screen.findByRole('button'));
  await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('BecomeAgent'));
  expect(api.post).toHaveBeenCalledWith(`/seller-agent-partners/link/${TOKEN}/accept`);
});

test('already an approved agent: joined at once', async () => {
  api.get.mockResolvedValue({ data: summary });
  api.post.mockResolvedValue({ data: { status: 'accepted', next: 'done', shopName: 'BIS' } });
  render(<SellerAgentInvite token={TOKEN} isLoggedIn onNavigate={jest.fn()} />);
  fireEvent.click(await screen.findByRole('button'));
  expect(await screen.findByText('Umejiunga')).toBeTruthy();
});

test('another phone number is told to use the invited number (403)', async () => {
  api.get.mockResolvedValue({ data: summary });
  api.post.mockRejectedValue({ response: { status: 403 } });
  const onNavigate = jest.fn();
  render(<SellerAgentInvite token={TOKEN} isLoggedIn onNavigate={onNavigate} />);
  fireEvent.click(await screen.findByRole('button'));
  expect(await screen.findByText(/namba nyingine/)).toBeTruthy();
  expect(onNavigate).not.toHaveBeenCalled();
});
