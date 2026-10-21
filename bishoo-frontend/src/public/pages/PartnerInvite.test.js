import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PartnerInvite from './PartnerInvite';
import api from '../../api/api';
import { destinationForPage, DESTINATION_KIND } from '../../navigation/destinationRegistry';

jest.mock('../../api/api', () => ({ get: jest.fn(), post: jest.fn() }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key) => key }) }));

const TOKEN = 'eyJuIjoieCJ9.c2lnbmF0dXJl';
const summary = {
  status: 'opened', roleOffered: 'transport_provider', invitedName: 'Juma',
  invitedBy: { officeName: 'Ofisi ya Ubungo', city: 'Dar es Salaam' },
  waybill: { waybillNumber: 'KTX4829103755', originCity: 'Dar es Salaam', destinationCity: 'Mwanza', weightKg: 12 },
};

beforeEach(() => { api.get.mockReset(); api.post.mockReset(); });

test('the invitation link is a public destination', () => {
  expect(destinationForPage(`PartnerInvite-${TOKEN}`)).toEqual(expect.objectContaining({ kind: DESTINATION_KIND.PUBLIC }));
  expect(destinationForPage('PartnerInvite-abc')).toBeNull();
});

test('shows the waybill summary; logged out, joining goes to login first', async () => {
  api.get.mockResolvedValue({ data: summary });
  const onNavigate = jest.fn();
  render(<PartnerInvite token={TOKEN} isLoggedIn={false} onNavigate={onNavigate} />);
  expect(await screen.findByText('KTX4829103755')).toBeTruthy();
  expect(api.get).toHaveBeenCalledWith(`/partner-invitations/link/${TOKEN}`);
  fireEvent.click(screen.getByRole('button'));
  expect(onNavigate).toHaveBeenCalledWith('PublicLogin');
  expect(api.post).not.toHaveBeenCalled();
});

test('logged in: accept, then the normal application for the offered role', async () => {
  api.get.mockResolvedValue({ data: summary });
  api.post.mockResolvedValue({ data: { status: 'opened', roleOffered: 'transport_provider', next: 'apply' } });
  const onNavigate = jest.fn();
  render(<PartnerInvite token={TOKEN} isLoggedIn onNavigate={onNavigate} />);
  fireEvent.click(await screen.findByRole('button'));
  await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('BecomeTransportProvider'));
  expect(api.post).toHaveBeenCalledWith(`/partner-invitations/link/${TOKEN}/accept`);
});

test('an expired link says so (410)', async () => {
  api.get.mockRejectedValue({ response: { status: 410 } });
  render(<PartnerInvite token={TOKEN} isLoggedIn={false} onNavigate={jest.fn()} />);
  expect(await screen.findByText('partner_invite.expired')).toBeTruthy();
});
