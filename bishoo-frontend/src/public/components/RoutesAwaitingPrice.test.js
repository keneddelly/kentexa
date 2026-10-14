import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import RoutesAwaitingPrice from './RoutesAwaitingPrice';
import api from '../../api/api';
import sw from '../../locales/sw.json';

jest.mock('react-i18next', () => {
  const texts = require('../../locales/sw.json');
  return { useTranslation: () => ({ t: (key) => key.split('.').reduce((o, k) => (o ? o[k] : undefined), texts) ?? key }) };
});
jest.mock('../../api/api', () => ({ get: jest.fn(), patch: jest.fn() }));

const route = { id: 12, originCity: 'Dar es Salaam', destinationCity: 'Mbeya' };
let waiting;
beforeEach(() => {
  waiting = [route];
  api.get.mockImplementation(async () => ({ data: waiting }));
  api.patch.mockImplementation(async () => { waiting = []; return { data: {} }; });
});

test('no price yet: asks for one and does not send an empty price', async () => {
  const onCount = jest.fn();
  await act(async () => { render(<RoutesAwaitingPrice onCount={onCount} />); });
  expect(screen.getByText('Dar es Salaam → Mbeya')).toBeInTheDocument();
  expect(onCount).toHaveBeenLastCalledWith(1);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: sw.transport_signup.weka_bei_button })); });
  expect(screen.getByRole('alert')).toHaveTextContent(sw.transport_signup.price_required);
  expect(api.patch).not.toHaveBeenCalled();
});

test('"Weka bei" saves the price, switches the route on and the card goes away', async () => {
  const onPriced = jest.fn(), onCount = jest.fn();
  await act(async () => { render(<RoutesAwaitingPrice onPriced={onPriced} onCount={onCount} />); });
  fireEvent.change(screen.getByLabelText(sw.transport_signup.price_per_kg), { target: { value: '500' } });
  fireEvent.change(screen.getByLabelText(sw.transport_signup.min_fee), { target: { value: '5000' } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: sw.transport_signup.weka_bei_button })); });
  expect(api.patch).toHaveBeenCalledWith('/transport/routes/12', { pricePerKg: 500, fixedFee: 5000, isActive: true });
  expect(onPriced).toHaveBeenCalled();
  expect(onCount).toHaveBeenLastCalledWith(0);
  expect(screen.queryByTestId('routes-awaiting-price')).toBeNull();
});
