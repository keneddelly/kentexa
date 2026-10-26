import React from 'react';
import { render, screen, within, fireEvent } from '@testing-library/react';
import BuyerParcelAction from './BuyerParcelAction';
import api from '../../api/api';

jest.mock('react-i18next', () => {
  const texts = require('../../locales/sw.json');
  return { useTranslation: () => ({ t: (key, vars) => {
    const v = key.split('.').reduce((o, k) => (o ? o[k] : undefined), texts) ?? key;
    return String(v).replace(/\{\{(\w+)\}\}/g, (_m, k) => (vars && vars[k] != null ? vars[k] : ''));
  } }) };
});
jest.mock('../../api/api', () => ({ get: jest.fn(), post: jest.fn() }));

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{23F3}\u{231B}]/u;
const hoursAgo = (h) => new Date(Date.now() - h * 3600000).toISOString();

test('arrived parcel: clear choice, newest history first, no emoji', async () => {
  api.get.mockResolvedValue({ data: {
    trackingNumber: 'KTX-1', status: 'awaiting_buyer', originCity: 'Arusha', destinationCity: 'Dar es Salaam', destinationAgent: 'Ofisi ya Ubungo',
    history: [
      { status: 'origin_hub_received', createdAt: hoursAgo(40) },
      { status: 'destination_hub_received', createdAt: hoursAgo(1) },
    ],
  } });
  const { container } = render(<BuyerParcelAction onNavigate={jest.fn()} isLoggedIn trackingNumber="KTX-1" />);
  expect(await screen.findByTestId('parcel-status')).toHaveTextContent('Umefika, unakusubiri');
  expect(screen.getByTestId('choice-pickup')).toHaveTextContent('Nitachukua ofisini');
  expect(screen.getByTestId('choice-deliver')).toHaveTextContent('Niletewe nyumbani');
  const items = within(screen.getByTestId('parcel-history')).getAllByRole('listitem');
  expect(items).toHaveLength(2);
  expect(container.textContent).not.toMatch(/destination_hub_received|origin_hub_received/);
  expect(EMOJI.test(container.textContent)).toBe(false);
});

test('agents list: no rating shown for an agent with no deliveries, no medals', async () => {
  api.get.mockImplementation((url) => url.startsWith('/super-agents/track/')
    ? Promise.resolve({ data: { trackingNumber: 'KTX-2', status: 'awaiting_buyer', destinationCity: 'Mwanza', history: [] } })
    : Promise.resolve({ data: [
      { id: 'a1', fullName: 'Juma Boda', city: 'Mwanza', rating: 5, totalDeliveriesCompleted: 0, deliveryFee: 3000, tier: 'gold' },
      { id: 'a2', fullName: 'Neema Express', city: 'Mwanza', rating: 4.6, totalDeliveriesCompleted: 12, deliveryFee: 4000 },
    ] }));
  const { container } = render(<BuyerParcelAction onNavigate={jest.fn()} isLoggedIn trackingNumber="KTX-2" />);
  fireEvent.click(await screen.findByTestId('choice-deliver'));
  expect(await screen.findByTestId('agent-a1')).not.toHaveTextContent('5.0');
  expect(screen.getByTestId('agent-a2')).toHaveTextContent('4.6 / 5');
  fireEvent.click(screen.getByTestId('agent-a2'));
  expect(screen.getByRole('button', { name: /Thibitisha, TZS 4,000/ })).toBeInTheDocument();
  expect(EMOJI.test(container.textContent)).toBe(false);
});
