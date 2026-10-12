import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import OfficePoint from './OfficePoint';
import api from '../../api/api';
import sw from '../../locales/sw.json';

jest.mock('react-i18next', () => {
  const texts = require('../../locales/sw.json');
  return { useTranslation: () => ({ t: (key, vars) => {
    const v = key.split('.').reduce((o, k) => (o ? o[k] : undefined), texts) ?? key;
    return String(v).replace(/\{\{(\w+)\}\}/g, (_m, k) => (vars && vars[k] != null ? vars[k] : ''));
  } }) };
});
jest.mock('../../api/api', () => ({ get: jest.fn(), patch: jest.fn(), post: jest.fn() }));
afterEach(() => jest.clearAllMocks());

test('no office point: the card asks for it; the button saves the phone position', async () => {
  api.patch.mockResolvedValue({ data: { officePointSet: true, officePointByGps: true, message: 'Mahali pa ofisi pamehifadhiwa.' } });
  const onSaved = jest.fn();
  render(<OfficePoint officePointSet={false} officePointByGps={false} onSaved={onSaved}
    getPosition={async () => ({ latitude: -6.8185, longitude: 39.277, accuracyM: 15 })} />);
  expect(screen.getByText(sw.office_point.explain)).toBeInTheDocument();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: sw.office_point.button })); });
  expect(api.patch).toHaveBeenCalledWith('/super-agents/my-profile/office-point', { latitude: -6.8185, longitude: 39.277, accuracyM: 15 });
  expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ officePointByGps: true }));
  expect(screen.getByRole('status')).toHaveTextContent('Mahali pa ofisi pamehifadhiwa.');
});

test('only an approximate place point: says so and still offers the GPS button', () => {
  render(<OfficePoint officePointSet officePointByGps={false} />);
  expect(screen.getByText(sw.office_point.only_place)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: sw.office_point.button })).toBeInTheDocument();
});

test('a weak GPS fix: the server message is shown', async () => {
  api.patch.mockRejectedValue({ response: { data: { message: 'Usahihi wa GPS ni mdogo (zaidi ya mita 500).' } } });
  render(<OfficePoint getPosition={async () => ({ latitude: -6.8, longitude: 39.2, accuracyM: 900 })} />);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: sw.office_point.button })); });
  expect(screen.getByRole('alert')).toHaveTextContent('Usahihi wa GPS ni mdogo');
});

test('set with GPS: a short line with "Badilisha"', () => {
  render(<OfficePoint officePointSet officePointByGps />);
  expect(screen.getByText(sw.office_point.change)).toBeInTheDocument();
  expect(screen.queryByText(sw.office_point.explain)).toBeNull();
});
