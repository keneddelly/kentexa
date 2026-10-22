import React from 'react';
import { render, screen, act } from '@testing-library/react';
import RouteRangePanel from './RouteRangePanel';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ get: jest.fn() }));

beforeEach(() => { jest.useFakeTimers(); api.get.mockReset(); });
afterEach(() => { jest.useRealTimers(); });

const show = async (data, props = { destinationCity: 'Mwanza', weightKg: '2' }) => {
  api.get.mockResolvedValue({ data });
  render(<RouteRangePanel {...props} />);
  await act(async () => { jest.advanceTimersByTime(450); });
};

test('counter: the rounded range and this office\'s position; it is guidance only', async () => {
  await show({ destinationCity: 'Mwanza', weightKg: 2, officeCount: 4, range: { low: 5000, middle: 6500, high: 9000 }, mine: 6000, position: 'middle' });
  expect(api.get).toHaveBeenCalledWith('/super-agents/me/route-range', { params: { destinationCity: 'Mwanza', weightKg: 2 } });
  expect(screen.getByText('TZS 5,000 – TZS 9,000')).toBeTruthy();
  expect(screen.getByText(/Bei yako iko katikati ya soko/)).toBeTruthy();
  expect(screen.getByText(/unaweza kuandika ada yoyote/)).toBeTruthy();
});

test('too few offices on the route: no range is shown', async () => {
  await show({ destinationCity: 'Kigoma', weightKg: 1, officeCount: 2, range: null, mine: 4000, position: null });
  expect(screen.getByText(/Ofisi chache mno/)).toBeTruthy();
  expect(screen.queryByText(/TZS 4,000/)).toBeNull();
});

test('no destination yet: no request, nothing shown', async () => {
  render(<RouteRangePanel destinationCity="" weightKg="" />);
  await act(async () => { jest.advanceTimersByTime(450); });
  expect(api.get).not.toHaveBeenCalled();
  expect(screen.queryByTestId('route-range')).toBeNull();
});
