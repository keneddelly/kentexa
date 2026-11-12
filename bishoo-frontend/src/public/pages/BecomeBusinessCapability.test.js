import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BecomeBusinessCapability from './BecomeBusinessCapability';
import { getMyBusinesses, getBusinessWorkspaces, getBusinessCapabilityApplications, applyForBusinessCapability } from '../../api/business';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key) => key }) }));
jest.mock('../../api/business', () => ({
  getMyBusinesses: jest.fn(),
  getBusinessWorkspaces: jest.fn(),
  getBusinessCapabilityApplications: jest.fn(),
  applyForBusinessCapability: jest.fn(),
  connectSelling: jest.fn(),
}));
jest.mock('../components/VerifyIdentityModal', () => () => null);

beforeEach(() => {
  jest.clearAllMocks();
  getMyBusinesses.mockResolvedValue([{ id: 2, legalName: 'Example Business' }]);
  getBusinessWorkspaces.mockResolvedValue([{ id: 21, name: 'Main office' }]);
  getBusinessCapabilityApplications.mockResolvedValue([]);
  applyForBusinessCapability.mockResolvedValue({});
});

test('parcel office application uses the only available workspace', async () => {
  render(<BecomeBusinessCapability businessId={2} code="super_agent" isLoggedIn onNavigate={jest.fn()} />);

  await waitFor(() => expect(screen.getByLabelText('apply_capability.workspace_label')).toBeInTheDocument());
  fireEvent.click(screen.getByText('apply_capability.submit_button'));

  await waitFor(() => expect(applyForBusinessCapability).toHaveBeenCalledWith(2, 'super_agent', undefined, 21));
  expect(await screen.findByText('apply_capability.success_title')).toBeInTheDocument();
});

test('parcel office application requires an explicit choice when a business has multiple workspaces', async () => {
  getBusinessWorkspaces.mockResolvedValue([
    { id: 21, name: 'Main office' },
    { id: 22, name: 'Second office' },
  ]);
  render(<BecomeBusinessCapability businessId={2} code="super_agent" isLoggedIn onNavigate={jest.fn()} />);

  const select = await screen.findByLabelText('apply_capability.workspace_label');
  fireEvent.click(screen.getByText('apply_capability.submit_button'));
  expect(screen.getByText('apply_capability.workspace_required')).toBeInTheDocument();
  expect(applyForBusinessCapability).not.toHaveBeenCalled();

  fireEvent.change(select, { target: { value: '22' } });
  fireEvent.click(screen.getByText('apply_capability.submit_button'));
  await waitFor(() => expect(applyForBusinessCapability).toHaveBeenCalledWith(2, 'super_agent', undefined, 22));
});
