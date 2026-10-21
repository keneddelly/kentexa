import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import OfficePricePreview, { feeDiffers } from './OfficePricePreview';
import OfficePriceRuleCard from './OfficePriceRuleCard';
import api from '../../api/api';
import { buildReceiptHtml, priceLinesSw } from '../../utils/receiptPrint';

jest.mock('../../api/api', () => ({ get: jest.fn(), post: jest.fn(), put: jest.fn() }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key) => key }) }));

const darQuote = {
  pickup: { status: 'not_included', amount: 0 },
  transport: { amount: 10000, mode: 'value', percent: 10, minimum: 5000 },
  delivery: { status: 'free', amount: 0, source: 'boda' },
  total: 10000, currency: 'TZS', ruleSource: 'office', fallback: null,
};

beforeEach(() => { jest.useFakeTimers(); api.get.mockReset(); api.post.mockReset(); api.put.mockReset(); });
afterEach(() => { jest.useRealTimers(); });

const input = { declaredValue: '100000', weightKg: '', destinationCity: 'Dar es Salaam', servicePath: 'local_agent', deliveryAddress: 'Kariakoo' };

test('counter preview: pickup, transport, delivery ("Bure"), total; fills the fee', async () => {
  api.post.mockResolvedValue({ data: darQuote });
  const onQuote = jest.fn();
  render(<OfficePricePreview input={input} fee="" onQuote={onQuote} />);
  await act(async () => { jest.advanceTimersByTime(450); });
  await waitFor(() => expect(onQuote).toHaveBeenCalledWith(darQuote));
  expect(api.post).toHaveBeenCalledWith('/super-agents/me/price-quote', expect.objectContaining({ declaredValue: 100000, servicePath: 'local_agent' }));
  expect(screen.getByText('Haihusiki')).toBeTruthy();
  expect(screen.getByText('Bure')).toBeTruthy();
  expect(screen.getAllByText('TZS 10,000').length).toBe(2); // transport and total
});

test('a different fee asks for a reason; the same fee does not', async () => {
  api.post.mockResolvedValue({ data: darQuote });
  const { rerender } = render(<OfficePricePreview input={input} fee="8000" reason="" onQuote={() => {}} />);
  await act(async () => { jest.advanceTimersByTime(450); });
  expect(await screen.findByPlaceholderText(/Punguzo/)).toBeTruthy();
  rerender(<OfficePricePreview input={input} fee="10000" reason="" onQuote={() => {}} />);
  expect(screen.queryByPlaceholderText(/Punguzo/)).toBeNull();
  expect(feeDiffers(darQuote, '8000')).toBe(true);
  expect(feeDiffers(darQuote, '10000')).toBe(false);
  expect(feeDiffers(darQuote, '')).toBe(false);
});

test('no goods value yet: no request, nothing shown', () => {
  render(<OfficePricePreview input={{ ...input, declaredValue: '' }} fee="" onQuote={() => {}} />);
  act(() => { jest.advanceTimersByTime(450); });
  expect(api.post).not.toHaveBeenCalled();
  expect(screen.queryByTestId('office-price-preview')).toBeNull();
});

test('printed receipt shows the four price lines, and the reason when changed', () => {
  expect(priceLinesSw(darQuote)).toEqual([['Kuchukua', 'Haihusiki'], ['Usafirishaji', 'TZS 10,000'], ['Kufikisha', 'Bure'], ['Jumla', 'TZS 10,000']]);
  const html = buildReceiptHtml({ parcelReference: 'KTX4829103755', amountPaid: 9000, priceBreakdown: { ...darQuote, changed: true, charged: 9000, changeReason: 'Mteja wa kudumu' } }, { autoPrint: false });
  for (const s of ['Kuchukua', 'Usafirishaji', 'Kufikisha', 'Jumla', 'Bure', 'Mteja wa kudumu']) expect(html).toContain(s);
  expect(buildReceiptHtml({ parcelReference: 'X', amountPaid: 1 }, { autoPrint: false })).not.toContain('Usafirishaji'); // older receipts unchanged
});

test('Bei page: shows the rule and saves by kg', async () => {
  jest.useRealTimers();
  api.get.mockResolvedValue({ data: { chargeMode: 'value', valuePercent: 10, valueMinimum: 5000, source: 'default', isDarEsSalaam: true } });
  api.put.mockResolvedValue({ data: { chargeMode: 'kg', valuePercent: 10, valueMinimum: 5000, source: 'office', isDarEsSalaam: true } });
  render(<OfficePriceRuleCard />);
  expect(screen.getByText('office_price_rule.title', { exact: false })).toBeTruthy();
  expect(await screen.findByText('office_price_rule.default_note', { exact: false })).toBeTruthy(); // after the rule loads
  fireEvent.click(screen.getByText('office_price_rule.by_kg'));
  fireEvent.click(screen.getByText('office_price_rule.save'));
  await waitFor(() => expect(api.put).toHaveBeenCalledWith('/super-agents/me/price-rule', { chargeMode: 'kg', valuePercent: 10, valueMinimum: 5000 }));
  expect(await screen.findByText('office_price_rule.saved')).toBeTruthy();
});
