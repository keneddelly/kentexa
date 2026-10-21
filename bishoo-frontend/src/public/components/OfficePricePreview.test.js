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
  total: 10000, currency: 'TZS', ruleSource: 'office',
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

test('same-city in Dar: the transport line is "Haihusiki", the total is the boda fee', async () => {
  const sameCity = { ...darQuote, transport: { amount: 0, mode: 'same_city', minimum: 0 }, delivery: { status: 'charged', amount: 6000, source: 'boda' }, total: 6000 };
  api.post.mockResolvedValue({ data: sameCity });
  render(<OfficePricePreview input={input} fee="6000" onQuote={() => {}} />);
  await act(async () => { jest.advanceTimersByTime(450); });
  expect(await screen.findByText('Ndani ya Dar es Salaam: ada ya boda boda tu', { exact: false })).toBeTruthy();
  expect(screen.getAllByText('Haihusiki').length).toBe(2); // pickup and transport
  expect(priceLinesSw(sameCity)).toEqual([['Kuchukua', 'Haihusiki'], ['Usafirishaji', 'Haihusiki'], ['Kufikisha', 'TZS 6,000'], ['Jumla', 'TZS 6,000']]);
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

test('Bei page, by kg: no percent or minimum fields; the office\'s own rates are shown read-only', async () => {
  jest.useRealTimers();
  const rates = [{ destinationCity: 'Mwanza', ratePerKg: 3000, minimumCharge: 4000, estimatedDays: 2 }];
  api.get.mockResolvedValue({ data: { chargeMode: 'kg', valuePercent: 10, valueMinimum: 5000, source: 'office', isDarEsSalaam: false, rates } });
  render(<OfficePriceRuleCard />);
  expect(await screen.findByText('Mwanza')).toBeTruthy();
  expect(api.get).toHaveBeenCalledWith('/super-agents/me/price-rule');
  expect(screen.getByText('TZS 3,000')).toBeTruthy();
  expect(screen.getByText('TZS 4,000')).toBeTruthy();
  expect(screen.queryByText('office_price_rule.percent')).toBeNull();
  expect(screen.queryAllByRole('spinbutton')).toHaveLength(0); // nothing to edit here
  expect(screen.getByText('office_price_rule.kg_rates_note', { exact: false })).toBeTruthy();
  // By value brings the percent and minimum fields back.
  fireEvent.click(screen.getByText('office_price_rule.by_value'));
  expect(screen.getByText('office_price_rule.percent')).toBeTruthy();
  expect(screen.queryAllByRole('spinbutton')).toHaveLength(2);
});

test('Bei page, by kg with no rates: says every by-kg parcel will be refused until a rate is set', async () => {
  jest.useRealTimers();
  api.get.mockResolvedValue({ data: { chargeMode: 'kg', valuePercent: 10, valueMinimum: 5000, source: 'office', isDarEsSalaam: false, rates: [] } });
  render(<OfficePriceRuleCard />);
  expect(await screen.findByText('office_price_rule.kg_no_rates')).toBeTruthy();
});

test('counter preview shows the refusal for a town with no kg rate', async () => {
  const message = 'Ofisi hii inatoza kwa kilo, lakini hakuna bei ya kilo kwa Mbeya.';
  api.post.mockRejectedValue({ response: { data: { message } } });
  render(<OfficePricePreview input={{ ...input, destinationCity: 'Mbeya', servicePath: 'intercity' }} fee="" onQuote={jest.fn()} />);
  await act(async () => { jest.advanceTimersByTime(450); });
  expect(await screen.findByRole('alert')).toHaveTextContent(message);
});
