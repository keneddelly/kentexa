import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import OfficePrices from './OfficePrices';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn() }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key) => key }) }));
jest.mock('./OfficePickupCard', () => () => null);

const mwanza = { destinationCity: 'Mwanza', ratePerKg: 3000, minimumCharge: 4000, estimatedDays: 2 };
const rule = (over = {}) => ({ chargeMode: 'value', valuePercent: 10, valueMinimum: 5000, source: 'default', isDarEsSalaam: true, rates: [mwanza], ...over });

const regions = [{ name: 'Arusha' }, { name: 'Dodoma' }, { name: 'Mwanza' }];

const serve = ({ priceRule = rule(), rates = [{ id: 1, ...mwanza }] } = {}) => {
  api.get.mockImplementation(async (url) => {
    if (url === '/super-agents/me/price-rule') {
      if (!priceRule) throw Object.assign(new Error('403'), { response: { status: 403 } });
      return { data: priceRule };
    }
    if (url === '/super-agents/my-profile') return { data: { id: 10, businessName: 'Bishoo', city: 'Dar es Salaam' } };
    if (url.startsWith('/super-agents/rates/')) return { data: rates };
    if (url === '/locations/regions') return { data: regions };
    return { data: [] };
  });
};

const openPage = async () => {
  render(<OfficePrices />);
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
  expect(screen.queryAllByText('Mwanza', { ignore: 'option, script, style' })).toHaveLength(0); // no read-only table
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
  fireEvent.click(screen.getByText('office_price_rule.by_kg'));   // rows show by kg only
  await screen.findByDisplayValue('Mwanza');
  fireEvent.change(screen.getByDisplayValue('3000'), { target: { value: '3200' } });
  fireEvent.click(screen.getByText('super_agent_settings.rate_save_button'));
  await waitFor(() => expect(api.post).toHaveBeenCalled());
  expect(api.put).toHaveBeenCalledWith('/super-agents/me/price-rule', { chargeMode: 'kg', valuePercent: 10, valueMinimum: 5000 });
  expect(api.post).toHaveBeenCalledWith('/super-agents/rates', {
    rates: [{ id: 1, destinationCity: 'Mwanza', ratePerKg: 3200, minimumCharge: 4000, estimatedDays: 2 }],
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

// ── Three Bei fixes (2026-10-22): rows only by kg, destination from the region list,
// empty fields stay empty ──────────────────────────────────────────────────────────
const kgOffice = (rates) => serve({ priceRule: rule({ chargeMode: 'kg', source: 'office' }), rates });
const destination = (row) => row.querySelector('select');

test('"By value" hides the route rows; "By kg" shows them (saved rows untouched)', async () => {
  serve();
  api.put.mockResolvedValue({ data: rule({ source: 'office' }) });
  await openPage();
  await screen.findByTestId('office-price-rule');
  await waitFor(() => expect(api.get).toHaveBeenCalledWith('/super-agents/rates/Dar%20es%20Salaam'));
  expect(screen.queryAllByTestId('route-row')).toHaveLength(0);
  expect(screen.queryByText('+ super_agent_settings.rate_add_route')).toBeNull();
  fireEvent.click(screen.getByText('office_price_rule.by_kg'));
  expect(await screen.findAllByTestId('route-row')).toHaveLength(1);
  expect(screen.getByDisplayValue('Mwanza')).toBeTruthy();
  fireEvent.click(screen.getByText('office_price_rule.by_value'));
  expect(screen.queryAllByTestId('route-row')).toHaveLength(0);
  // Saving by value sends the rule only: the hidden rows are neither re-sent nor removed.
  fireEvent.click(screen.getByText('super_agent_settings.rate_save_button'));
  expect(await screen.findByText('office_price_rule.saved')).toBeTruthy();
  expect(api.post).not.toHaveBeenCalled();
  expect(api.delete).toBeUndefined();
});

test('the destination is a pick list of the engine\'s regions only', async () => {
  kgOffice([]);
  api.put.mockResolvedValue({ data: rule({ chargeMode: 'kg', source: 'office' }) });
  api.post.mockResolvedValue({ data: { message: 'ok' } });
  await openPage();
  const [row] = await screen.findAllByTestId('route-row');
  await waitFor(() => expect(destination(row).options.length).toBe(4));
  expect(row.querySelector('input[type="text"]')).toBeNull();          // no free text
  expect([...destination(row).options].map(o => o.value)).toEqual(['', 'Arusha', 'Dodoma', 'Mwanza']);
  // A value outside the list can't be chosen: the select stays on "pick".
  fireEvent.change(destination(row), { target: { value: 'Mwnza' } });
  expect(destination(row).value).toBe('');
  fireEvent.change(destination(row), { target: { value: 'Dodoma' } });
  fireEvent.change(row.querySelectorAll('input[type="number"]')[0], { target: { value: '2500' } });
  fireEvent.click(screen.getByText('super_agent_settings.rate_save_button'));
  await waitFor(() => expect(api.post).toHaveBeenCalled());
  expect(api.post.mock.calls[0][1].rates.map(r => r.destinationCity)).toEqual(['Dodoma']);
});

test('an old free-text row shows a warning, is kept, and is fixed in place when re-picked', async () => {
  kgOffice([{ id: 1, ...mwanza }, { id: 2, destinationCity: 'Mwnza', ratePerKg: 2000, minimumCharge: 0, estimatedDays: 3 }]);
  api.put.mockResolvedValue({ data: rule({ chargeMode: 'kg', source: 'office' }) });
  api.post.mockResolvedValue({ data: { message: 'ok' } });
  await openPage();
  const warning = await screen.findByTestId('route-legacy-warning');
  expect(warning).toHaveTextContent('super_agent_settings.rate_destination_unknown');
  expect(screen.getAllByTestId('route-row')).toHaveLength(2);           // still listed
  // Save before re-picking: the old row is not sent (so not changed) and nothing is deleted.
  fireEvent.click(screen.getByText('super_agent_settings.rate_save_button'));
  await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
  expect(api.post.mock.calls[0][1].rates.map(r => r.id)).toEqual([1]);
  expect(api.delete).toBeUndefined();
  // Re-pick: Mwanza is taken by row 1, so it is disabled; Arusha fixes row 2 by its id.
  const legacyRow = screen.getAllByTestId('route-row')[1];
  expect([...destination(legacyRow).options].find(o => o.value === 'Mwanza').disabled).toBe(true);
  fireEvent.change(destination(legacyRow), { target: { value: 'Arusha' } });
  expect(screen.queryByTestId('route-legacy-warning')).toBeNull();
  fireEvent.click(screen.getByText('super_agent_settings.rate_save_button'));
  await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2));
  expect(api.post.mock.calls[1][1].rates).toContainEqual({ id: 2, destinationCity: 'Arusha', ratePerKg: 2000, minimumCharge: 0, estimatedDays: 3 });
});

test('empty per-kg fields show empty and save as empty, never 3000 / 5000', async () => {
  kgOffice([{ id: 1, destinationCity: 'Mwanza', ratePerKg: '3000.00', minimumCharge: '0.00', estimatedDays: 2 }]);
  api.put.mockResolvedValue({ data: rule({ chargeMode: 'kg', source: 'office' }) });
  api.post.mockResolvedValue({ data: { message: 'ok' } });
  await openPage();
  await screen.findByDisplayValue('Mwanza');
  fireEvent.click(screen.getByText('+ super_agent_settings.rate_add_route'));
  const rows = screen.getAllByTestId('route-row');
  // No number placeholders that look like saved values; a saved 0 minimum shows empty.
  for (const input of document.querySelectorAll('[data-testid="route-row"] input[type="number"]')) {
    expect(['3000', '5000']).not.toContain(input.getAttribute('placeholder'));
  }
  const [kg1, min1] = rows[0].querySelectorAll('input[type="number"]');
  expect(kg1.value).toBe('3000');
  expect(min1.value).toBe('');
  const [kg2, min2] = rows[1].querySelectorAll('input[type="number"]');
  expect(kg2.value).toBe('');
  expect(min2.value).toBe('');
  fireEvent.change(destination(rows[1]), { target: { value: 'Arusha' } });
  fireEvent.change(kg2, { target: { value: '2200' } });                 // minimum left empty
  fireEvent.click(screen.getByText('super_agent_settings.rate_save_button'));
  await waitFor(() => expect(api.post).toHaveBeenCalled());
  const sent = api.post.mock.calls[0][1].rates;
  expect(sent.find(r => r.destinationCity === 'Arusha')).toEqual({ destinationCity: 'Arusha', ratePerKg: 2200, minimumCharge: 0, estimatedDays: 3 });
  expect(sent.find(r => r.id === 1).minimumCharge).toBe(0);
  expect(JSON.stringify(sent)).not.toMatch(/5000/);
});

test('360px: the route rows have no fixed widths that could overflow a phone', async () => {
  kgOffice([{ id: 1, ...mwanza }, { id: 2, destinationCity: 'Mwnza', ratePerKg: 2000, minimumCharge: 0, estimatedDays: 3 }]);
  await openPage();
  await screen.findByTestId('route-legacy-warning');
  for (const row of screen.getAllByTestId('route-row')) {
    expect(row.style.gridTemplateColumns).toBe('minmax(0, 1fr) minmax(0, 1fr)');   // columns can shrink
    for (const el of row.querySelectorAll('input, select')) {
      expect(el.style.width).toBe('100%');
      expect(el.style.boxSizing).toBe('border-box');
      expect(el.style.minWidth).toBe('');
    }
  }
});
