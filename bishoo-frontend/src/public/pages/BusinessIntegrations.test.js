import React from 'react';
import { render, screen } from '@testing-library/react';
import BusinessIntegrations, { REASON_TEXT } from './BusinessIntegrations';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn(), delete: jest.fn() } }));
jest.mock('../components/BackBar', () => () => null);

// Owner 2026-11-09: the real reason a connection failed, and whether messages reach KenteXa.
afterEach(() => window.history.replaceState(null, '', '/'));

test('a failed connect says why (no Page with Instagram)', async () => {
  window.history.replaceState(null, '', '/?instagramOAuth=error&instagramReason=no_instagram&businessId=9');
  api.get.mockResolvedValue({ data: [] });
  render(<BusinessIntegrations businessId={9} onNavigate={jest.fn()} />);
  expect(await screen.findByRole('alert')).toHaveTextContent(REASON_TEXT.no_instagram);
  expect(window.location.search).toBe('');
});

test('each account shows its Page and whether messages arrive, with Meta\'s reason when not', async () => {
  api.get.mockResolvedValue({ data: [
    { id: 70, instagramUsername: 'bis_tz', status: 'active', facebookPageName: 'BiS Page', webhookSubscribed: false, webhookError: '(#200) Requires pages_manage_metadata permission' },
    { id: 71, instagramUsername: 'old', status: 'reauth_required', webhookSubscribed: false },
  ] });
  render(<BusinessIntegrations businessId={9} onNavigate={jest.fn()} />);
  expect(await screen.findByText('Kupitia Page: BiS Page')).toBeInTheDocument();
  expect(screen.getByTestId('ig-webhook-70')).toHaveTextContent('Ujumbe bado hauingii KenteXa: (#200) Requires pages_manage_metadata permission');
  expect(screen.getByText(/Unganisha tena/)).toBeInTheDocument();
});
