import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import AgentSignupSteps from './AgentSignupSteps';
import api from '../../api/api';
import sw from '../../locales/sw.json';

jest.mock('react-i18next', () => {
  const texts = require('../../locales/sw.json');
  return { useTranslation: () => ({ t: (key, vars) => {
    const v = key.split('.').reduce((o, k) => (o ? o[k] : undefined), texts) ?? key;
    return String(v).replace(/\{\{(\w+)\}\}/g, (_m, k) => (vars && vars[k] != null ? vars[k] : ''));
  } }) };
});
jest.mock('../../api/api', () => ({ get: jest.fn(), post: jest.fn(), patch: jest.fn() }));
// The place list: shows the text it was given; a tap picks Kariakoo. No network.
jest.mock('./IntelligentLocationInput', () => ({ onResolved, label, value }) => (
  <button type="button" data-testid="place" data-value={value || ''}
    onClick={() => onResolved({ placeRef: { providerKey: 'tz_seed', providerPlaceId: 'kariakoo' }, regionName: 'Dar es Salaam' })}>
    {label}
  </button>
));
jest.mock('./VerifyIdentityModal', () => () => <div>identity-modal</div>);
afterEach(() => jest.clearAllMocks());

const user = { name: 'Juma Ally', phone: '255712345678' };
const btn = (name) => screen.getByRole('button', { name });
const identityIs = (status, places = []) => api.get.mockImplementation(async (url) => (
  url === '/identity/me' ? { data: { status, level: status === 'verified' ? 1 : 0 } } : { data: { candidates: places } }));

test('verified: one form, no ID step; name and phone come from the account, not asked', async () => {
  identityIs('verified');
  await act(async () => { render(<AgentSignupSteps currentUser={user} />); });
  expect(screen.queryByTestId('agent-identity-step')).toBeNull();
  expect(screen.getByText('Juma Ally')).toBeInTheDocument();
  expect(screen.getByText(/255712345678/)).toBeInTheDocument();
  // the whole form is on this one screen
  expect(btn(sw.agent_signup.city_label)).toBeInTheDocument();
  expect(btn(sw.agent_base.button)).toBeInTheDocument();
  expect(btn(sw.agent_signup.vehicle_boda)).toBeInTheDocument();
  expect(btn(sw.agent_signup.submit)).toBeDisabled();
  expect(screen.queryByRole('textbox')).toBeNull();            // no name/phone boxes
});

test('no ID yet: only the ID screen, no form', async () => {
  identityIs('not_submitted');
  await act(async () => { render(<AgentSignupSteps currentUser={user} />); });
  expect(screen.getByTestId('agent-identity-step')).toHaveTextContent(sw.agent_signup.identity_missing);
  expect(screen.queryByRole('button', { name: sw.agent_signup.submit })).toBeNull();
  fireEvent.click(btn(sw.agent_signup.identity_button));
  expect(screen.getByText('identity-modal')).toBeInTheDocument();
});

test('waiting ID may apply on the one screen; sends place, base point, vehicle and weight only', async () => {
  identityIs('pending');
  api.post.mockResolvedValue({ data: { message: 'Ombi limewasilishwa.', status: 'pending' } });
  const onSubmitted = jest.fn();
  await act(async () => {
    render(<AgentSignupSteps currentUser={user} onSubmitted={onSubmitted}
      getPosition={async () => ({ latitude: -6.8185, longitude: 39.277, accuracyM: 20 })} />);
  });
  expect(screen.getByText(sw.agent_signup.identity_pending)).toBeInTheDocument();
  fireEvent.click(btn(sw.agent_signup.city_label));
  await act(async () => { fireEvent.click(btn(sw.agent_base.button)); });
  fireEvent.click(btn(sw.agent_signup.vehicle_boda));
  expect(btn(sw.agent_signup.submit)).toBeDisabled();          // weight still missing
  fireEvent.change(screen.getByPlaceholderText('20'), { target: { value: '25' } });
  await act(async () => { fireEvent.click(btn(sw.agent_signup.submit)); });
  expect(api.post).toHaveBeenCalledWith('/agents/register', {
    place: { providerKey: 'tz_seed', providerPlaceId: 'kariakoo' },
    base: { latitude: -6.8185, longitude: 39.277, accuracyM: 20 },
    agentType: 'boda', maxWeightKg: 25,
  });
  expect(onSubmitted).toHaveBeenCalledWith('Ombi limewasilishwa.', { message: 'Ombi limewasilishwa.', status: 'pending' });
});

test('the account city is pre-filled, and picked only on an exact match from the place list', async () => {
  identityIs('verified', [{ displayLabel: 'Arusha', regionName: 'Arusha', placeRef: { providerKey: 'tz_seed', providerPlaceId: 'r-arusha' } }]);
  await act(async () => { render(<AgentSignupSteps currentUser={{ ...user, city: 'Arusha' }} />); });
  expect(api.get).toHaveBeenCalledWith('/location-intelligence/places', { params: { q: 'Arusha', limit: 8 } });
  expect(screen.getByTestId('place')).toHaveAttribute('data-value', 'Arusha');
  expect(screen.getByText('✔ Arusha')).toBeInTheDocument();      // picked: region shown
});
