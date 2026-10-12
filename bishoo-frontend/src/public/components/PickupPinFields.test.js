import React, { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import PickupPinFields from './PickupPinFields';
import { PickupPoint } from './ShipmentPickupQueue';
import sw from '../../locales/sw.json';

// Real Swahili texts from the language file (interpolates {{m}}).
jest.mock('react-i18next', () => {
  const texts = require('../../locales/sw.json');
  return { useTranslation: () => ({ t: (key, vars) => {
    const v = key.split('.').reduce((o, k) => (o ? o[k] : undefined), texts) ?? key;
    return String(v).replace(/\{\{(\w+)\}\}/g, (_m, k) => (vars && vars[k] != null ? vars[k] : ''));
  } }) };
});
jest.mock('../../api/api', () => ({ get: jest.fn(async () => ({ data: [] })), post: jest.fn() }));

function Harness({ getPosition }) {
  const [pin, setPin] = useState(null);
  const [landmark, setLandmark] = useState('');
  return <PickupPinFields pin={pin} onPin={setPin} landmark={landmark} onLandmark={setLandmark} getPosition={getPosition} />;
}

test('sender: the pin is asked for, the button finds it and shows the accuracy', async () => {
  const getPosition = jest.fn(async () => ({ latitude: -6.8155, longitude: 39.2866, accuracyM: 18, capturedAt: 'x' }));
  render(<Harness getPosition={getPosition} />);
  expect(screen.getByText(sw.pickup_pin.ask)).toBeInTheDocument();
  await act(async () => { fireEvent.click(screen.getByText(sw.pickup_pin.use_location)); });
  expect(screen.getByText(/Mahali pamepatikana \(±18 m\)/)).toBeInTheDocument();
  expect(screen.getByText(sw.pickup_pin.remove)).toBeInTheDocument();
});

test('sender: permission refused -> a Swahili explanation, and the note still works', async () => {
  const getPosition = jest.fn(async () => { const e = new Error('denied'); e.code = 'denied'; throw e; });
  render(<Harness getPosition={getPosition} />);
  await act(async () => { fireEvent.click(screen.getByText(sw.pickup_pin.use_location)); });
  expect(screen.getByRole('alert')).toHaveTextContent(sw.pickup_pin.error_denied);
  fireEvent.change(screen.getByPlaceholderText(sw.pickup_pin.landmark_placeholder), { target: { value: 'Geti jeusi' } });
  expect(screen.getByDisplayValue('Geti jeusi')).toBeInTheDocument();
});

test('sender: a weak GPS fix is flagged', async () => {
  render(<Harness getPosition={async () => ({ latitude: -6.8, longitude: 39.28, accuracyM: 450, capturedAt: 'x' })} />);
  await act(async () => { fireEvent.click(screen.getByText(sw.pickup_pin.use_location)); });
  expect(screen.getByText(sw.pickup_pin.weak)).toBeInTheDocument();
});

test('agent after accepting: "Fungua ramani" with the pin, or "Hakuna pin" without', () => {
  const { rerender } = render(<PickupPoint point={{ hasPin: true, latitude: -6.8155, longitude: 39.2866, accuracyM: 18,
    landmark: 'Geti jeusi', ward: null, mapsUrl: 'https://www.google.com/maps/dir/?api=1&destination=-6.8155,39.2866', note: null }} />);
  expect(screen.getByText('📍 Fungua ramani').closest('a')).toHaveAttribute('href', 'https://www.google.com/maps/dir/?api=1&destination=-6.8155,39.2866');
  expect(screen.getByText(/Geti jeusi/)).toBeInTheDocument();
  rerender(<PickupPoint point={{ hasPin: false, landmark: 'Geti jeusi', note: 'Hakuna pin — piga simu kwa mtumaji' }} />);
  expect(screen.getByText('Hakuna pin — piga simu kwa mtumaji')).toBeInTheDocument();
  expect(screen.queryByText('📍 Fungua ramani')).toBeNull();
});
