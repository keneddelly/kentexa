import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SuperAgentSettings from './SuperAgentSettings';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn() }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key) => key }) }));
jest.mock('../components/IntelligentLocationInput', () => () => null);
jest.mock('../components/OfficePoint', () => () => null);
jest.mock('../components/BackBar', () => () => null);

const mwanza = { destinationCity: 'Mwanza', ratePerKg: 3000, minimumCharge: 4000, estimatedDays: 2 };
const rule = (over = {}) => ({ chargeMode: 'value', valuePercent: 10, valueMinimum: 5000, source: 'default', isDarEsSalaam: true, rates: [mwanza], ...over });

const serve = ({ priceRule = rule(), rates = [{ id: 1, ...mwanza }] } = {}) => {
  api.get.mockImplementation(async (url) => {
    if (url === '/super-agents/me/price-rule') {
      if (!priceRule) throw Object.assign(new Error('403'), { response: { status: 403 } });
      return { data: priceRule };
    }
    if (url === '/super-agents/my-profile') return { data: { id: 10, businessName: 'Bishoo', city: 'Dar es Salaam' } };
    if (url.startsWith('/super-agents/rates/')) return { data: rates };
    return { data: [] };
  });
};

const openPage = async () => {
  render(<SuperAgentSettings onNavigate={jest.fn()} isLoggedIn />);
  return screen.findByTestId('bei-card');
};

beforeEach(() => { api.get.mockReset(); api.post.mockReset(); api.put.mockReset(); api.patch.mockReset(); });

test('one Bei card: "How you charge" at the top, then the route form, and one Save', async () => {
  serve();
  await openPage();
  expect(await screen.findByTestId('office-price-rule')).toBeTruthy();
  expect(screen.getByText('office_price_rule.default_note', { exact: false })).toBeTruthy();
  // By value: Percent and Minimum, with the defaults 10% and TZS 5,000.
  expect(screen.getByDisplayValue('10')).toBeTruthy();
  expect(screen.getByDisplayValue('5000')).toBeTruthy();
  // One Save for the card; the old "Save how you charge" button is gone.
  expect(screen.getAllByText('super_agent_settings.rate_save_button')).toHaveLength(1);
  expect(screen.queryByText('office_price_rule.save')).toBeNull();
});

test('each rate appears once on the page, where it is edited', async () => {
  serve({ priceRule: rule({ chargeMode: 'kg', source: 'office' }) });
  await openPage();
  expect(await screen.findByTestId('office-kg-note')).toHaveTextContent('office_price_rule.kg_uses_routes');
  await screen.findByDisplayValue('Mwanza');
  expect(screen.getAllByDisplayValue('Mwanza')).toHaveLength(1);   // the editable row
  expect(screen.queryAllByText('Mwanza')).toHaveLength(0);         // no read-only table
  expect(screen.queryByText('TZS 3,000')).toBeNull();
  // By kg: no Percent / Minimum fields; By value brings them back.
  expect(screen.queryByText('office_price_rule.percent')).toBeNull();
  fireEvent.click(screen.getByText('office_price_rule.by_value'));
  expect(screen.getByText('office_price_rule.percent')).toBeTruthy();
});

test('the one Save saves the charging rule, then the routes (same endpoints)', async () => {
  serve();
  api.put.mockResolvedValue({ data: rule({ chargeMode: 'kg', source: 'office' }) });
  api.post.mockResolvedValue({ data: { message: 'ok' } });
  await openPage();
  await screen.findByTestId('office-price-rule');
  await screen.findByDisplayValue('Mwanza');
  fireEvent.click(screen.getByText('office_price_rule.by_kg'));
  fireEvent.change(screen.getByDisplayValue('3000'), { target: { value: '3200' } });
  fireEvent.click(screen.getByText('super_agent_settings.rate_save_button'));
  await waitFor(() => expect(api.post).toHaveBeenCalled());
  expect(api.put).toHaveBeenCalledWith('/super-agents/me/price-rule', { chargeMode: 'kg', valuePercent: 10, valueMinimum: 5000 });
  expect(api.post).toHaveBeenCalledWith('/super-agents/rates', {
    rates: [{ destinationCity: 'Mwanza', ratePerKg: 3200, minimumCharge: 4000, estimatedDays: 2 }],
  });
  expect(api.put.mock.invocationCallOrder[0]).toBeLessThan(api.post.mock.invocationCallOrder[0]);
  expect(await screen.findByText('super_agent_settings.rate_save_success')).toBeTruthy();
});

test('by value with no routes yet: Save saves the charging rule alone', async () => {
  serve({ rates: [] });
  api.put.mockResolvedValue({ data: rule({ source: 'office', valuePercent: 8 }) });
  await openPage();
  await screen.findByTestId('office-price-rule');
  fireEvent.change(screen.getByDisplayValue('10'), { target: { value: '8' } });
  fireEvent.click(screen.getByText('super_agent_settings.rate_save_button'));
  expect(await screen.findByText('office_price_rule.saved')).toBeTruthy();
  expect(api.put).toHaveBeenCalledWith('/super-agents/me/price-rule', { chargeMode: 'value', valuePercent: 8, valueMinimum: 5000 });
  expect(api.post).not.toHaveBeenCalled();
});

test('not an active office: no charging section, Save works on routes as before', async () => {
  serve({ priceRule: null, rates: [] });
  await openPage();
  await waitFor(() => expect(api.get).toHaveBeenCalledWith('/super-agents/me/price-rule'));
  expect(screen.queryByTestId('office-price-rule')).toBeNull();
  fireEvent.click(screen.getByText('super_agent_settings.rate_save_button'));
  expect(await screen.findByText('super_agent_settings.rate_validation_error', { exact: false })).toBeTruthy();
  expect(api.put).not.toHaveBeenCalled();
});
