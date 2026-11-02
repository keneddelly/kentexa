import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import DarAreaPicker, { withDarArea } from './DarAreaPicker';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ get: jest.fn() }));

const areas = [
  { key: 'kati_0', road: 'kati', roadLabel: 'Kati', ring: 0, places: ['Kariakoo', 'Upanga'] },
  { key: 'bagamoyo_2', road: 'bagamoyo', roadLabel: 'Barabara ya Bagamoyo', ring: 2, places: ['Mwenge', 'Kijitonyama'] },
];

test('a Dar place KenteXa does not know: the customer picks a known area, road by road or by search (owner 2026-11-02)', async () => {
  api.get.mockResolvedValue({ data: { areas } });
  const onPick = jest.fn();
  await act(async () => { render(<DarAreaPicker placeText="Kwa Mtogole" onPick={onPick} />); });
  expect(api.get).toHaveBeenCalledWith('/boda-rates/dar-areas');
  expect(screen.getByTestId('dar-area-picker')).toHaveTextContent('Hatukutambua "Kwa Mtogole"');
  expect(screen.getByTestId('dar-area-Kariakoo')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: 'Barabara ya Bagamoyo' }));
  fireEvent.click(screen.getByTestId('dar-area-Mwenge'));
  expect(onPick).toHaveBeenCalledWith('Mwenge');
  fireEvent.change(screen.getByLabelText('Tafuta eneo'), { target: { value: 'upa' } });
  expect(screen.getByTestId('dar-area-Upanga')).toBeInTheDocument();
  expect(screen.queryByTestId('dar-area-Mwenge')).toBeNull();
  expect(withDarArea('Mwenge', 'Kwa Mtogole, Kinondoni')).toBe('Mwenge — Kwa Mtogole, Kinondoni');
});

test('no areas from the server: nothing is shown', async () => {
  api.get.mockRejectedValue(new Error('down'));
  await act(async () => { render(<DarAreaPicker onPick={jest.fn()} />); });
  expect(screen.queryByTestId('dar-area-picker')).toBeNull();
});
