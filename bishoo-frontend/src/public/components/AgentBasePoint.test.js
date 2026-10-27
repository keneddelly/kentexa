import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import AgentBasePoint from './AgentBasePoint';
import ShipmentPickupQueue from './ShipmentPickupQueue';
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

test('no base point yet: the card asks for it; the button saves the phone position', async () => {
  api.patch.mockResolvedValue({ data: { hasBasePoint: true, baseSetAt: '2026-10-12T10:00:00Z', message: 'Kituo chako kimehifadhiwa.' } });
  const onSaved = jest.fn();
  render(<AgentBasePoint hasBasePoint={false} onSaved={onSaved}
    getPosition={async () => ({ latitude: -6.816, longitude: 39.2895, accuracyM: 25, capturedAt: 'x' })} />);
  expect(screen.getByText(sw.agent_base.title)).toBeInTheDocument();
  await act(async () => { fireEvent.click(screen.getByText(sw.agent_base.button)); });
  expect(api.patch).toHaveBeenCalledWith('/agents/my-base', { latitude: -6.816, longitude: 39.2895, accuracyM: 25 });
  expect(onSaved).toHaveBeenCalled();
  expect(screen.getByRole('status')).toHaveTextContent('Kituo chako kimehifadhiwa.');
});

test('a weak GPS fix: the server message is shown, nothing silent', async () => {
  api.patch.mockRejectedValue({ response: { data: { message: 'Usahihi wa GPS ni mdogo (zaidi ya mita 500).' } } });
  render(<AgentBasePoint hasBasePoint={false} getPosition={async () => ({ latitude: -6.8, longitude: 39.2, accuracyM: 900 })} />);
  await act(async () => { fireEvent.click(screen.getByText(sw.agent_base.button)); });
  expect(screen.getByRole('alert')).toHaveTextContent('Usahihi wa GPS ni mdogo');
});

test('base point set: a big "Kituo changu" card with a map, the date and a large change button', () => {
  render(<AgentBasePoint hasBasePoint baseSetAt="2026-10-12T10:00:00Z" latitude={-6.816} longitude={39.2895} area="Kariakoo, Dar es Salaam" />);
  expect(screen.getByText(sw.agent_base.card_title)).toBeInTheDocument();
  expect(screen.getByText('Kariakoo, Dar es Salaam')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Fungua kituo changu kwenye ramani' }).getAttribute('href')).toMatch(/openstreetmap\.org\/\?mlat=-6\.816&mlon=39\.2895/);
  expect(screen.getByRole('button', { name: sw.agent_base.change })).toBeInTheDocument();
  expect(screen.queryByText(sw.agent_base.title)).toBeNull();
});

test('the map tile is the one that holds the base point', () => {
  const { tileFor } = require('./AgentBasePoint');
  const tile = tileFor(-6.816, 39.2895, 16);
  expect(tile).toMatchObject({ zoom: 16, x: 39920, y: 34011 });
  expect(tile.fx).toBeGreaterThanOrEqual(0); expect(tile.fx).toBeLessThan(1);
});

test('open jobs show the rounded distance from the agent base', async () => {
  api.get.mockImplementation(async (url) => ({ data: url === '/pickup-tasks/available'
    ? [{ id: 3, itemDescription: 'Nguo', deliverTo: 'recipient', pickupArea: 'Kariakoo', destinationArea: 'Mbagala', weightKg: 2, distance: '~1.5 km' }]
    : [] }));
  await act(async () => { render(<ShipmentPickupQueue />); });
  expect(await screen.findByText(/Umbali kutoka kituo chako: ~1\.5 km/)).toBeInTheDocument();
});
