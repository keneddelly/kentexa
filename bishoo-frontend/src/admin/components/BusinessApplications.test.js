import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BusinessApplications from './BusinessApplications';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ get: jest.fn(), post: jest.fn() }));

const pending = {
  id: 5, capabilityCode: 'super_agent', status: 'pending', submittedAt: '2026-10-24T08:00:00Z', applicationData: { city: 'Mwanza' },
  businessId: 3, businessName: 'Mtandao Transport', businessStatus: 'active', applicantName: 'Juma', applicantPhone: '255700000001',
  profileStatus: 'pending',
};

beforeEach(() => { api.get.mockReset(); api.post.mockReset(); window.confirm = jest.fn(() => true); window.prompt = jest.fn(() => 'Missing documents'); });

test('lists pending applications and approves one', async () => {
  api.get.mockResolvedValueOnce({ data: [pending] }).mockResolvedValueOnce({ data: [] });
  api.post.mockResolvedValue({ data: {} });
  render(<BusinessApplications />);
  expect(await screen.findByText('Mtandao Transport')).toBeTruthy();
  expect(screen.getByText('Office')).toBeTruthy();
  expect(screen.getByText('City: Mwanza')).toBeTruthy();
  expect(api.get).toHaveBeenCalledWith('/admin/business-capability-applications', { params: { status: 'pending' } });
  fireEvent.click(screen.getByText('Approve'));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/admin/business-capability-applications/5/approve'));
  expect(await screen.findByTestId('no-applications')).toBeTruthy();
});

test('rejects with a reason', async () => {
  api.get.mockResolvedValue({ data: [pending] });
  api.post.mockResolvedValue({ data: {} });
  render(<BusinessApplications />);
  fireEvent.click(await screen.findByText('Reject'));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/admin/business-capability-applications/5/reject', { rejectionReason: 'Missing documents' }));
});

test('a load failure is shown, not a blank page', async () => {
  api.get.mockRejectedValue({ response: { data: { message: 'Forbidden resource' } } });
  render(<BusinessApplications />);
  expect(await screen.findByRole('alert')).toBeTruthy();
});

// Owner 2026-11-09: the real server shape (nested), and the old sellers without an ID.
const nested = {
  application: { id: 9, capabilityCode: 'commerce', status: 'pending', submittedAt: '2026-10-20T08:00:00Z', applicationData: null, rejectionReason: null },
  business: { id: 4, name: 'Duka la Baraka', status: 'active' }, workspace: { id: 2 },
  applicant: { userId: 40, name: 'Baraka', phone: '255713000002', identityStatus: 'not_submitted' },
  operationalProfile: { type: 'seller_profile', id: 8, status: 'pending' }, legacyWithoutId: true,
};

test('the server\'s nested rows show names and approve the right application', async () => {
  api.get.mockResolvedValue({ data: [nested] });
  api.post.mockResolvedValue({ data: {} });
  render(<BusinessApplications />);
  expect(await screen.findByText('Duka la Baraka')).toBeTruthy();
  expect(screen.getByText('Selling (Seller)')).toBeTruthy();
  expect(screen.getByTestId('id-status-9')).toHaveTextContent('No ID sent');
  fireEvent.click(screen.getByText('Approve'));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/admin/business-capability-applications/9/approve'));
});

test('an old seller without an ID: mark ID checked + approve, with a reason', async () => {
  api.get.mockResolvedValue({ data: [nested] });
  api.post.mockResolvedValue({ data: {} });
  window.prompt = jest.fn(() => 'Aliomba kabla ya sharti la kitambulisho');
  render(<BusinessApplications />);
  fireEvent.click(await screen.findByTestId('approve-without-id-9'));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/admin/business-capability-applications/9/approve-legacy-without-id',
    { reason: 'Aliomba kabla ya sharti la kitambulisho' }));
});

test('the button is only offered for old sellers without an ID', async () => {
  api.get.mockResolvedValue({ data: [{ ...nested, legacyWithoutId: false, applicant: { ...nested.applicant, identityStatus: 'pending' } }] });
  render(<BusinessApplications />);
  expect(await screen.findByText('Duka la Baraka')).toBeTruthy();
  expect(screen.queryByTestId('approve-without-id-9')).toBeNull();
  expect(screen.getByTestId('id-status-9')).toHaveTextContent('ID sent, waiting');
});
