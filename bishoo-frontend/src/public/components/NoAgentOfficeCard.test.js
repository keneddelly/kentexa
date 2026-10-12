import React from 'react';
import { render, screen } from '@testing-library/react';
import NoAgentOfficeCard from './NoAgentOfficeCard';
import sw from '../../locales/sw.json';

jest.mock('react-i18next', () => {
  const texts = require('../../locales/sw.json');
  return { useTranslation: () => ({ t: (key, vars) => {
    const v = key.split('.').reduce((o, k) => (o ? o[k] : undefined), texts) ?? key;
    return String(v).replace(/\{\{(\w+)\}\}/g, (_m, k) => (vars && vars[k] != null ? vars[k] : ''));
  } }) };
});

test('no agent: the nearest office with phone and "Fungua ramani"', () => {
  render(<NoAgentOfficeCard office={{ name: 'Kariakoo Hub', phone: '0755000111', address: 'Mtaa wa Congo',
    mapsUrl: 'https://www.google.com/maps/dir/?api=1&destination=-6.8185,39.277', distance: '~600 m' }} />);
  expect(screen.getByText(sw.send_shipment.no_agent_now)).toBeInTheDocument();
  expect(screen.getByText(/Peleka mzigo ofisini/)).toBeInTheDocument();
  expect(screen.getByText('Kariakoo Hub')).toBeInTheDocument();
  expect(screen.getByText('Umbali: ~600 m')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /0755000111/ })).toHaveAttribute('href', 'tel:0755000111');
  expect(screen.getByRole('link', { name: /Fungua ramani/ })).toHaveAttribute('href', expect.stringContaining('google.com/maps/dir'));
});

test('an office without a map point: no map link', () => {
  render(<NoAgentOfficeCard office={{ name: 'Posta Hub', phone: null, address: null, mapsUrl: null, distance: null }} />);
  expect(screen.getByText('Posta Hub')).toBeInTheDocument();
  expect(screen.queryByRole('link')).toBeNull();
});

test('no office in the city: says so honestly', () => {
  render(<NoAgentOfficeCard office={null} />);
  expect(screen.getByText(sw.send_shipment.no_agent_no_office)).toBeInTheDocument();
});
