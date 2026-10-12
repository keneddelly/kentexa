import { getPhonePosition, landmarkOk } from './phoneLocation';
import { shipmentBody } from '../api/shipmentRequests';

describe('"Tumia mahali nilipo": the phone position', () => {
  test('returns the GPS point with its accuracy and time', async () => {
    const geo = { getCurrentPosition: (ok, _err, opts) => {
      expect(opts).toMatchObject({ enableHighAccuracy: true, maximumAge: 0 });
      ok({ coords: { latitude: -6.81551234, longitude: 39.28665555, accuracy: 17.6 }, timestamp: Date.parse('2026-10-12T10:00:00Z') });
    } };
    await expect(getPhonePosition(geo)).resolves.toEqual({
      latitude: -6.815512, longitude: 39.286656, accuracyM: 18, capturedAt: '2026-10-12T10:00:00.000Z' });
  });

  test('names each failure so the screen can explain it', async () => {
    const failWith = (code) => ({ getCurrentPosition: (_ok, err) => err({ code }) });
    await expect(getPhonePosition(failWith(1))).rejects.toMatchObject({ code: 'denied' });
    await expect(getPhonePosition(failWith(2))).rejects.toMatchObject({ code: 'unavailable' });
    await expect(getPhonePosition(failWith(3))).rejects.toMatchObject({ code: 'timeout' });
    await expect(getPhonePosition(undefined)).rejects.toMatchObject({ code: 'unsupported' });
  });

  test('landmark note: 5 to 160 characters', () => {
    expect(landmarkOk('Geti')).toBe(false);
    expect(landmarkOk('  Geti jeusi  ')).toBe(true);
    expect(landmarkOk('x'.repeat(161))).toBe(false);
  });
});

describe('the shipment request carries the pickup point only for door pickup', () => {
  const pin = { latitude: -6.8155, longitude: 39.2866, accuracyM: 18, capturedAt: '2026-10-12T10:00:00Z' };
  const base = { receiverName: 'A', receiverPhone: '1', origin: 'Posta', destination: 'Mbezi', itemDescription: 'Nguo' };
  test('door: landmark (trimmed) and pin', () => {
    const body = shipmentBody({ ...base, pickupOption: 'door', pickupLandmark: '  Geti jeusi ', pickupPin: pin }, {}, null);
    expect(body.pickupLandmark).toBe('Geti jeusi');
    expect(body.pickupPin).toEqual(pin);
  });
  test('door without a pin: landmark only', () => {
    const body = shipmentBody({ ...base, pickupOption: 'door', pickupLandmark: 'Geti jeusi', pickupPin: null }, {}, null);
    expect(body.pickupPin).toBeUndefined();
  });
  test('not door: neither is sent', () => {
    const body = shipmentBody({ ...base, pickupOption: 'station', pickupLandmark: 'Geti jeusi', pickupPin: pin }, {}, null);
    expect(body.pickupLandmark).toBeUndefined();
    expect(body.pickupPin).toBeUndefined();
  });
});
