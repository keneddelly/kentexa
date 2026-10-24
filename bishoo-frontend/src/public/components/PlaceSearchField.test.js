import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import PlaceSearchField, { placeLabel, fromTyped } from './PlaceSearchField';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ get: jest.fn() }));
beforeEach(() => { api.get.mockReset(); jest.useFakeTimers(); });
afterEach(() => { jest.useRealTimers(); });

const KARIAKOO = { placeRef: { providerKey: 'tz_seed', providerPlaceId: 'ward:6' }, displayLabel: 'Kariakoo, Ilala, Dar es Salaam',
  level: 'ward', regionName: 'Dar es Salaam', districtName: 'Ilala', wardName: 'Kariakoo' };

test('type a place and pick it: the form gets the same shape as before', async () => {
  api.get.mockResolvedValue({ data: { candidates: [KARIAKOO] } });
  const onChange = jest.fn();
  render(<PlaceSearchField value={{}} onChange={onChange} />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'kariak' } });
  await act(async () => { jest.advanceTimersByTime(300); });
  await waitFor(() => expect(api.get).toHaveBeenCalledWith('/location-intelligence/places', { params: { q: 'kariak', limit: 8 } }));
  fireEvent.click(await screen.findByRole('option', { name: 'Kariakoo, Ilala, Dar es Salaam' }));
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
    wardName: 'Kariakoo', districtName: 'Ilala', regionName: 'Dar es Salaam', placeRef: KARIAKOO.placeRef,
  }));
  expect(screen.getByRole('textbox').value).toBe('Kariakoo, Ilala, Dar es Salaam');
});

test('a place the search does not know can be used as typed', async () => {
  api.get.mockResolvedValue({ data: { candidates: [] } });
  const onChange = jest.fn();
  render(<PlaceSearchField value={{}} onChange={onChange} />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Kwa Mtogole' } });
  await act(async () => { jest.advanceTimersByTime(300); });
  fireEvent.click(await screen.findByRole('option', { name: /Tumia “Kwa Mtogole”/ }));
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ wardName: 'Kwa Mtogole' }));
});

test('a saved listing shows its place', () => {
  render(<PlaceSearchField value={{ wardName: 'Sinza', districtName: 'Ubungo', regionName: 'Dar es Salaam' }} onChange={() => {}} />);
  expect(screen.getByRole('textbox').value).toBe('Sinza, Ubungo, Dar es Salaam');
  expect(api.get).not.toHaveBeenCalled();
});

test('labels', () => {
  expect(placeLabel({ districtName: 'Ilala', regionName: 'Dar es Salaam' })).toBe('Ilala, Dar es Salaam');
  expect(placeLabel(fromTyped('Mbezi Beach, Kinondoni, Dar es Salaam'))).toBe('Mbezi Beach, Kinondoni, Dar es Salaam');
});
