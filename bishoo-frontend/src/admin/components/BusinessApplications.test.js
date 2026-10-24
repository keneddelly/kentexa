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
  expect(screen.getByText('Office (Super Agent)')).toBeTruthy();
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
