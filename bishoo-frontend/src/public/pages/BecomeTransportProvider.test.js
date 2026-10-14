import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import BecomeTransportProvider from './BecomeTransportProvider';
import api from '../../api/api';
import sw from '../../locales/sw.json';

jest.mock('react-i18next', () => {
  const texts = require('../../locales/sw.json');
  return { useTranslation: () => ({ t: (key, vars) => {
    const v = key.split('.').reduce((o, k) => (o ? o[k] : undefined), texts) ?? key;
    return String(v).replace(/\{\{(\w+)\}\}/g, (_m, k) => (vars && vars[k] != null ? vars[k] : ''));
  } }) };
});
jest.mock('../../api/api', () => ({ get: jest.fn(), post: jest.fn() }));
jest.mock('../components/BackBar', () => () => null);
jest.mock('../components/VerifyIdentityModal', () => () => <div>identity-modal</div>);
// The place list: a tap picks the place named in the label.
jest.mock('../components/IntelligentLocationInput', () => ({ onResolved, label }) => (
  <button type="button" onClick={() => onResolved({ placeRef: { providerKey: 'tz', providerPlaceId: label.includes('unaanzia') ? 'dar' : 'mbeya' } })}>{label}</button>
));

const user = { name: 'Juma', phone: '255712345678' };
const btn = (name) => screen.getByRole('button', { name });
const setup = async (identity, existing = null) => {
  api.get.mockImplementation(async (url) => {
    if (url === '/identity/me') return { data: { status: identity } };
    if (url === '/transport/my-profile') { if (existing) return { data: existing }; throw new Error('404'); }
    return { data: null };
  });
  await act(async () => { render(<BecomeTransportProvider isLoggedIn currentUser={user} onNavigate={jest.fn()} />); });
};

test('no ID yet: only the ID screen', async () => {
  await setup('not_submitted');
  expect(screen.getByTestId('transport-identity-step')).toBeInTheDocument();
  expect(screen.queryByTestId('transport-form')).toBeNull();
});

test('one screen: basi / lori / van only, phone from the account; sends the vehicle and the main route', async () => {
  await setup('pending');
  expect(screen.getByText(sw.transport_signup.identity_waiting_note)).toBeInTheDocument();
  expect(screen.queryByText(/Boda|Courier/i)).toBeNull();
  expect(screen.getByTestId('transport-account-line')).toHaveTextContent('255712345678');
  fireEvent.click(btn(sw.transport_signup.type_truck));
  fireEvent.change(screen.getByPlaceholderText(sw.transport_signup.name_placeholder), { target: { value: 'Juma Express' } });
  fireEvent.change(screen.getByPlaceholderText('T 123 ABC'), { target: { value: 't 123 abc' } });
  fireEvent.change(screen.getByPlaceholderText('2000'), { target: { value: '5000' } });
  expect(btn(sw.transport_signup.submit)).toBeDisabled();             // route still missing
  fireEvent.click(btn(sw.transport_signup.from_label));
  fireEvent.click(btn(sw.transport_signup.to_label));
  api.post.mockResolvedValue({ data: { id: 4, status: 'pending' } });
  await act(async () => { fireEvent.click(btn(sw.transport_signup.submit)); });
  expect(api.post).toHaveBeenCalledWith('/transport/register', {
    type: 'truck', name: 'Juma Express', registrationNumber: undefined,
    vehicle: { registrationPlate: 'T 123 ABC', weightCapacityKg: 5000, parcelCapacity: undefined },
    route: { from: { providerKey: 'tz', providerPlaceId: 'dar' }, to: { providerKey: 'tz', providerPlaceId: 'mbeya' } },
  });
  expect(screen.getByTestId('transport-status')).toHaveTextContent(sw.work_roles.status_waiting_id);
});

test('an approved provider sees the status and the dashboard button', async () => {
  await setup('verified', { id: 4, status: 'verified' });
  expect(screen.getByTestId('transport-status')).toHaveTextContent(sw.transport_signup.status_approved_title);
  expect(btn(sw.transport_signup.go_dashboard)).toBeInTheDocument();
});

test('the dashboard button switches to the transport role first', async () => {
  const onSwitchAccountRole = jest.fn();
  api.get.mockImplementation(async (url) => (url === '/transport/my-profile' ? { data: { id: 4, status: 'verified' } } : { data: { status: 'verified' } }));
  await act(async () => {
    render(<BecomeTransportProvider isLoggedIn currentUser={user} onNavigate={jest.fn()} onSwitchAccountRole={onSwitchAccountRole}
      availableRoles={[{ roleType: 'transport_provider', status: 'active', accountRoleId: 45 }]} />);
  });
  fireEvent.click(btn(sw.transport_signup.go_dashboard));
  expect(onSwitchAccountRole).toHaveBeenCalledWith(45, 'TransportProviderDashboard');
});
