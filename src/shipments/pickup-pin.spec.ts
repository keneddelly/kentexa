import { mapsDirectionsUrl, PICKUP_PIN_MESSAGES, pickupPointForAgent, readPickupPin, SHOW_PIN_WARD } from './pickup-pin';
import { PickupTasksService } from './pickup-tasks.service';
import { AccountRoleType } from '../role-context/entities/account-role.entity';

const now = new Date('2026-10-12T10:00:00Z');
const posta = { latitude: -6.8155, longitude: 39.2866, accuracyM: 18, capturedAt: '2026-10-12T09:59:30Z' };

describe('door pickup: sender pin and landmark (section 18, step 1)', () => {
  it('nothing is stored for a pickup that is not at the door', () => {
    expect(readPickupPin(false, 'Geti jeusi', posta, now)).toEqual({
      pickupLandmark: null, pickupPinLatitude: null, pickupPinLongitude: null, pickupPinAccuracyM: null, pickupPinCapturedAt: null });
  });

  it('the landmark note is required for door pickup (5-160 characters), in Swahili', () => {
    expect(() => readPickupPin(true, '', null, now)).toThrow(PICKUP_PIN_MESSAGES.landmarkRequired);
    expect(() => readPickupPin(true, 'abc', null, now)).toThrow('Andika alama');
    expect(() => readPickupPin(true, 'x'.repeat(161), null, now)).toThrow('Andika alama');
  });

  it('the pin is optional until the map exists: landmark alone is accepted', () => {
    expect(readPickupPin(true, '  Geti   jeusi\nkaribu na msikiti ', undefined, now)).toMatchObject({
      pickupLandmark: 'Geti jeusi karibu na msikiti', pickupPinLatitude: null, pickupPinLongitude: null });
  });

  it('keeps a GPS pin with its accuracy and capture time', () => {
    expect(readPickupPin(true, 'Geti jeusi Posta', posta, now)).toEqual({
      pickupLandmark: 'Geti jeusi Posta', pickupPinLatitude: -6.8155, pickupPinLongitude: 39.2866,
      pickupPinAccuracyM: 18, pickupPinCapturedAt: new Date('2026-10-12T09:59:30Z') });
  });

  it('refuses a pin outside Tanzania or a broken one; an implausible phone time becomes "now"', () => {
    expect(() => readPickupPin(true, 'Geti jeusi', { latitude: 51.5, longitude: -0.12 }, now)).toThrow(PICKUP_PIN_MESSAGES.pinOutsideTanzania);
    expect(() => readPickupPin(true, 'Geti jeusi', { latitude: 'x', longitude: 39 }, now)).toThrow(PICKUP_PIN_MESSAGES.pinInvalid);
    expect(() => readPickupPin(true, 'Geti jeusi', { ...posta, accuracyM: 99999 }, now)).toThrow(PICKUP_PIN_MESSAGES.pinInvalid);
    expect(readPickupPin(true, 'Geti jeusi', { ...posta, capturedAt: '2020-01-01T00:00:00Z' }, now).pickupPinCapturedAt).toEqual(now);
  });
});

describe('what the agent sees', () => {
  it('after accepting, with a pin: the exact point, landmark, ward and "Fungua ramani" link', () => {
    expect(pickupPointForAgent({ pickupPinLatitude: -6.8155, pickupPinLongitude: 39.2866, pickupPinAccuracyM: 18,
      pickupLandmark: 'Geti jeusi', pickupWardName: 'Kivukoni' })).toEqual({
      hasPin: true, latitude: -6.8155, longitude: 39.2866, accuracyM: 18, landmark: 'Geti jeusi', ward: null,
      mapsUrl: 'https://www.google.com/maps/dir/?api=1&destination=-6.8155,39.2866', note: null });
    expect(mapsDirectionsUrl(-6.8, 39.28)).toBe('https://www.google.com/maps/dir/?api=1&destination=-6.8,39.28');
  });

  it('after accepting, without a pin: landmark and "Hakuna pin — piga simu kwa mtumaji"', () => {
    expect(pickupPointForAgent({ pickupLandmark: 'Geti jeusi' })).toMatchObject({
      hasPin: false, latitude: null, mapsUrl: null, landmark: 'Geti jeusi', note: 'Hakuna pin — piga simu kwa mtumaji' });
  });

  const role: any = { userId: 50, profileId: 5, roleType: AccountRoleType.AGENT };
  const row = {
    id: 9, status: 'requested', servicePath: 'direct_delivery', createdAt: now, originSnapshot: { label: 'Posta, Ilala' },
    originCity: 'Dar es Salaam', destinationCity: 'Dar es Salaam', itemDescription: 'Nguo', weightKg: 2,
    pickupWardName: 'Kivukoni', pickupPinLatitude: -6.8155, pickupPinLongitude: 39.2866, pickupLandmark: 'Geti jeusi',
    pickupContactName: 'Juma', pickupContactPhone: '0712000111',
  };
  const service = (rows: any[]) => {
    const s: any = Object.create(PickupTasksService.prototype);
    s.db = { query: jest.fn(async () => rows) };
    s.assertAgentRole = jest.fn();
    s.approvedAgent = jest.fn(async () => ({ id: 5, city: 'Dar es Salaam' }));
    return s;
  };

  it('BEFORE accepting (open jobs list): never the pin, landmark or phone (ward hidden for now)', async () => {
    const s = service([row]);
    const [job] = await s.listAvailable(50, role);
    expect(SHOW_PIN_WARD).toBe(false); // wrong names with today's ward list (Posta -> Gerezani)
    expect(job.pickupWard).toBeNull();
    expect(JSON.stringify(job)).not.toMatch(/-6\.8155|39\.2866|Geti jeusi|0712000111/);
    expect(s.db.query.mock.calls[0][0]).not.toMatch(/pickupPinLatitude|pickupLandmark/);
  });

  it('AFTER accepting (my jobs, going to collect): the pickup point; not once collected', async () => {
    const claimed = await service([{ ...row, status: 'claimed' }]).listMine(50, role);
    expect(claimed[0].pickupPoint).toMatchObject({ hasPin: true, landmark: 'Geti jeusi', ward: null });
    const collected = await service([{ ...row, status: 'collected' }]).listMine(50, role);
    expect(collected[0].pickupPoint).toBeNull();
  });
});
