import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import OfficePricePreview, { feeDiffers } from './OfficePricePreview';
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

test('a town with no kg rate: no refusal, no suggestion, the agent types the fee with no reason asked', async () => {
  const noRate = {
    pickup: { status: 'not_included', amount: 0 }, transport: { amount: 0, mode: 'kg', minimum: 0, weightKg: 2, noRate: true },
    delivery: { status: 'not_included', amount: 0 }, total: 0, currency: 'TZS', ruleSource: 'office', noSuggestion: true,
  };
  api.post.mockResolvedValue({ data: noRate });
  render(<OfficePricePreview input={{ ...input, destinationCity: 'Mbeya', servicePath: 'intercity' }} fee="12000" onQuote={jest.fn()} />);
  await act(async () => { jest.advanceTimersByTime(450); });
  expect(await screen.findByTestId('office-price-no-suggestion')).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.queryByText(/Tumia/)).toBeNull();
  expect(screen.queryByPlaceholderText(/Punguzo/)).toBeNull();
  expect(feeDiffers(noRate, '12000')).toBe(false);
  expect(priceLinesSw({ ...noRate, charged: 12000, changed: true, changeReason: null }))
    .toEqual([['Kuchukua', 'Haihusiki'], ['Usafirishaji', 'Bei ya wakala'], ['Kufikisha', 'Haihusiki'], ['Jumla', 'TZS 12,000']]);
});
