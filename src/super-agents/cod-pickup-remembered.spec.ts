import { BadRequestException } from '@nestjs/common';
import { SuperAgentsService } from './super-agents.service';

// Owner 2026-10-25: "the form asks the seller's shop location each time an order is
// made". Asked once: the server reuses the shop place of the last COD boda pickup.
describe('the seller\'s shop place for COD boda pickups is asked once', () => {
  const kariakoo = { city: 'Dar es Salaam', label: 'Kariakoo, Ilala, Dar es Salaam', latitude: -6.82, longitude: 39.28, providerKey: 'tz_seed', providerPlaceId: 'ward:6' };
  const build = (rows: any[], resolved: any = null) => {
    const svc: any = Object.create(SuperAgentsService.prototype);
    svc.dataSource = { query: jest.fn(async () => rows) };
    svc.locationIntelligence = { resolve: jest.fn(async () => resolved) };
    return svc;
  };
  const seller = { id: 5, phone: '0712000111' } as any;

  it('no place sent: the last shop place in this city is used', async () => {
    const svc = build([{ snap: kariakoo }]);
    await expect(svc.resolveCodPickup({ originCity: 'Dar es Salaam' }, seller)).resolves.toEqual({ phone: '0712000111', snapshot: kariakoo });
    expect(svc.locationIntelligence.resolve).not.toHaveBeenCalled();
  });

  it('a shop place from another city is never reused; nothing saved yet = asked', async () => {
    await expect(build([{ snap: { ...kariakoo, city: 'Mwanza' } }]).resolveCodPickup({ originCity: 'Dar es Salaam' }, seller))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(build([]).resolveCodPickup({ originCity: 'Dar es Salaam' }, seller)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('a new place chosen: resolved and kept with its reference for next time', async () => {
    const svc = build([], { displayLabel: 'Sinza, Ubungo, Dar es Salaam', regionName: 'Dar es Salaam', districtName: 'Ubungo',
      latitude: -6.78, longitude: 39.22, providerKey: 'tz_seed', resolutionMethod: 'exact' });
    const r = await svc.resolveCodPickup({ originCity: 'Dar es Salaam', pickupPlace: { providerKey: 'tz_seed', providerPlaceId: 'ward:44' } }, seller);
    expect(r.snapshot).toMatchObject({ label: 'Sinza, Ubungo, Dar es Salaam', providerPlaceId: 'ward:44', city: 'Dar es Salaam' });
  });

  it('the form gets the saved label', async () => {
    await expect(build([{ snap: kariakoo }]).getLastCodPickup(seller, 'Dar es Salaam'))
      .resolves.toEqual({ label: 'Kariakoo, Ilala, Dar es Salaam', city: 'Dar es Salaam',
        placeRef: { providerKey: 'tz_seed', providerPlaceId: 'ward:6' }, point: { latitude: -6.82, longitude: 39.28 } });
    await expect(build([]).getLastCodPickup(seller, 'Dar es Salaam')).resolves.toBeNull();
  });
});
