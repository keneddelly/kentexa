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
// The place list: one picked place, no network.
jest.mock('./IntelligentLocationInput', () => ({ onResolved, label }) => (
  <button type="button" onClick={() => onResolved({ placeRef: { providerKey: 'tz_seed', providerPlaceId: 'kariakoo' }, regionName: 'Dar es Salaam' })}>
    {label}
  </button>
));
jest.mock('./VerifyIdentityModal', () => () => <div>identity-modal</div>);
afterEach(() => jest.clearAllMocks());

const user = { name: 'Juma Ally', phone: '255712345678' };
const btn = (name) => screen.getByRole('button', { name });

test('identity verified: "✔ Kitambulisho kimethibitishwa", no ID fields, name and phone from the account', async () => {
  api.get.mockResolvedValue({ data: { status: 'verified', level: 1 } });
  await act(async () => { render(<AgentSignupSteps currentUser={user} />); });
  expect(screen.getByTestId('identity-ok')).toHaveTextContent(sw.agent_signup.identity_verified);
  expect(screen.getByText('Juma Ally')).toBeInTheDocument();
  expect(screen.getByText('255712345678')).toBeInTheDocument();
  expect(screen.queryByRole('textbox')).toBeNull();            // nothing typed in step 1
  expect(btn(sw.agent_signup.next)).not.toBeDisabled();
});

test('no identity yet: only the "Tuma kitambulisho" step; cannot continue', async () => {
  api.get.mockResolvedValue({ data: { status: 'not_submitted', level: 0 } });
  await act(async () => { render(<AgentSignupSteps currentUser={user} />); });
  expect(screen.getByText(sw.agent_signup.identity_missing)).toBeInTheDocument();
  expect(btn(sw.agent_signup.next)).toBeDisabled();
  fireEvent.click(btn(`🪪 ${sw.agent_signup.identity_button}`));
  expect(screen.getByText('identity-modal')).toBeInTheDocument();
});

test('waiting identity may continue; all 3 steps send place, base point, vehicle and weight only', async () => {
  api.get.mockResolvedValue({ data: { status: 'pending', level: 1 } });
  api.post.mockResolvedValue({ data: { message: 'Ombi limewasilishwa.' } });
  const onSubmitted = jest.fn();
  await act(async () => {
    render(<AgentSignupSteps currentUser={user} onSubmitted={onSubmitted}
      getPosition={async () => ({ latitude: -6.8185, longitude: 39.277, accuracyM: 20 })} />);
  });
  expect(screen.getByText(`⏳ ${sw.agent_signup.identity_pending}`)).toBeInTheDocument();
  fireEvent.click(btn(sw.agent_signup.next));
  // Step 2: next stays off until both the place and the base point are set.
  expect(btn(sw.agent_signup.next)).toBeDisabled();
  fireEvent.click(btn(sw.agent_signup.city_label));
  await act(async () => { fireEvent.click(btn(sw.agent_base.button)); });
  fireEvent.click(btn(sw.agent_signup.next));
  // Step 3.
  fireEvent.click(btn(sw.agent_signup.vehicle_boda));
  fireEvent.change(screen.getByPlaceholderText('20'), { target: { value: '25' } });
  await act(async () => { fireEvent.click(btn(sw.agent_signup.submit)); });
  expect(api.post).toHaveBeenCalledWith('/agents/register', {
    place: { providerKey: 'tz_seed', providerPlaceId: 'kariakoo' },
    base: { latitude: -6.8185, longitude: 39.277, accuracyM: 20 },
    agentType: 'boda', maxWeightKg: 25,
  });
  expect(onSubmitted).toHaveBeenCalledWith('Ombi limewasilishwa.');
});
