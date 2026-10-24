import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import OfficePickupCard from './OfficePickupCard';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ get: jest.fn(), put: jest.fn() }));

beforeEach(() => { api.get.mockReset(); api.put.mockReset(); });

test('an office sets its own pickup price, with an optional distance', async () => {
  api.get.mockResolvedValue({ data: { mode: 'none', fee: null, maxKm: null, officePointSet: true } });
  api.put.mockImplementation(async (url, body) => ({ data: { ...body, fee: body.fee ?? null, officePointSet: true } }));
  render(<OfficePickupCard />);
  fireEvent.click(await screen.findByRole('radio', { name: /Nachukua kwa bei/ }));
  expect(screen.getByRole('button', { name: 'Hifadhi' }).disabled).toBe(true);    // a price is required
  fireEvent.change(screen.getByLabelText('Bei ya kuchukua (TZS)'), { target: { value: '2,000' } });
  fireEvent.change(screen.getByLabelText('Umbali wa juu kutoka ofisini (km, hiari)'), { target: { value: '3' } });
  fireEvent.click(screen.getByRole('button', { name: 'Hifadhi' }));
  await waitFor(() => expect(api.put).toHaveBeenCalledWith('/super-agents/me/pickup', { mode: 'fixed', fee: 2000, maxKm: 3 }));
  expect(await screen.findByRole('status')).toBeTruthy();
});

test('free pickup, anywhere in the city', async () => {
  api.get.mockResolvedValue({ data: { mode: 'none', fee: null, maxKm: null, officePointSet: false } });
  api.put.mockResolvedValue({ data: { mode: 'free', fee: null, maxKm: null, officePointSet: false } });
  render(<OfficePickupCard />);
  fireEvent.click(await screen.findByRole('radio', { name: /Nachukua bure/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Hifadhi' }));
  await waitFor(() => expect(api.put).toHaveBeenCalledWith('/super-agents/me/pickup', { mode: 'free', fee: undefined, maxKm: null }));
});

test('hidden until switched on, or for a non-office account', async () => {
  api.get.mockRejectedValue({ response: { status: 503 } });
  const { container } = render(<OfficePickupCard />);
  await waitFor(() => expect(api.get).toHaveBeenCalled());
  expect(container.querySelector('[data-testid="office-pickup-card"]')).toBeNull();
});

test('an office chooses to deliver inside its own city too (Kariakoo -> Mbezi)', async () => {
  api.get.mockResolvedValue({ data: { mode: 'none', fee: null, maxKm: null, officePointSet: true, sameCityDelivery: false } });
  api.put.mockImplementation(async (url, body) => ({ data: { mode: body.mode, fee: null, maxKm: null, officePointSet: true, sameCityDelivery: body.sameCityDelivery } }));
  render(<OfficePickupCard />);
  const box = await screen.findByRole('checkbox', { name: /Nasafirisha pia ndani ya mji wangu/ });
  expect(box.checked).toBe(false);
  fireEvent.click(box);
  fireEvent.click(screen.getByRole('button', { name: 'Hifadhi' }));
  await waitFor(() => expect(api.put).toHaveBeenCalledWith('/super-agents/me/pickup',
    { mode: 'none', fee: undefined, maxKm: null, sameCityDelivery: true }));
});

test('no same-city choice before the server has it', async () => {
  api.get.mockResolvedValue({ data: { mode: 'none', fee: null, maxKm: null, officePointSet: true, sameCityDelivery: null } });
  render(<OfficePickupCard />);
  await screen.findByRole('button', { name: 'Hifadhi' });
  expect(screen.queryByRole('checkbox')).toBeNull();
});
