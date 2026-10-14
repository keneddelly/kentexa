import { ForbiddenException } from '@nestjs/common';
import { MSAFIRISHAJI_MESSAGES, readMsafirishajiSignup } from './msafirishaji-signup';
import { TransportService } from './transport.service';
import { ProviderStatus } from './entities/transport-provider.entity';

// Msafirishaji one-screen sign-up (owner 2026-10-14).
const places: Record<string, any> = {
  dar: { regionName: 'Dar es Salaam', regionId: 2, displayLabel: 'Dar es Salaam' },
  mbeya: { regionName: 'Mbeya', regionId: 12, displayLabel: 'Mbeya' },
};
const resolve = async (ref: any) => places[ref.providerPlaceId] ?? null;
const ref = (id: string) => ({ providerKey: 'tz-admin', providerPlaceId: id });
const good: any = {
  name: 'Juma Express', type: 'bus', registrationNumber: '',
  vehicle: { registrationPlate: 't 123 abc', weightCapacityKg: 2000, parcelCapacity: '' },
  route: { from: ref('dar'), to: ref('mbeya') },
};

describe('Msafirishaji sign-up', () => {
  it('reads the one screen: type, name, plate, capacity, main route; phone from the account; licence optional', async () => {
    expect(await readMsafirishajiSignup(good, '255712345678', resolve)).toEqual({
      name: 'Juma Express', type: 'bus', registrationNumber: null, phone: '255712345678',
      vehicle: { registrationPlate: 'T 123 ABC', weightCapacityKg: 2000, parcelCapacity: null },
      route: { originCity: 'Dar es Salaam', originRegionId: 2, destinationCity: 'Mbeya', destinationRegionId: 12 },
    });
  });

  it('boda and courier are not this form (they sign up as Wakala); each missing part has its own message', async () => {
    const cases: [any, string | null, string][] = [
      [{ ...good, type: 'boda' }, '255712345678', MSAFIRISHAJI_MESSAGES.type],
      [{ ...good, type: 'courier' }, '255712345678', MSAFIRISHAJI_MESSAGES.type],
      [{ ...good, name: ' ' }, '255712345678', MSAFIRISHAJI_MESSAGES.name],
      [{ ...good, vehicle: { ...good.vehicle, registrationPlate: '' } }, '255712345678', MSAFIRISHAJI_MESSAGES.plate],
      [{ ...good, vehicle: { ...good.vehicle, weightCapacityKg: 0 } }, '255712345678', MSAFIRISHAJI_MESSAGES.capacity],
      [{ ...good, route: { to: ref('mbeya') } }, '255712345678', MSAFIRISHAJI_MESSAGES.from],
      [{ ...good, route: { from: ref('dar'), to: ref('nowhere') } }, '255712345678', MSAFIRISHAJI_MESSAGES.to],
      [{ ...good, route: { from: ref('dar'), to: ref('dar') } }, '255712345678', MSAFIRISHAJI_MESSAGES.sameEnds],
      [good, null, MSAFIRISHAJI_MESSAGES.noPhone],
    ];
    for (const [dto, phone, message] of cases) await expect(readMsafirishajiSignup(dto, phone, resolve)).rejects.toThrow(message);
  });

  it('a route cannot be switched on (made searchable) before the provider is approved', async () => {
    const s: any = Object.create(TransportService.prototype);
    s.getMyProfile = jest.fn(async () => ({ id: 3, status: ProviderStatus.PENDING }));
    s.routeRepo = { findOne: jest.fn(async () => ({ id: 9, providerId: 3, isActive: false })), save: jest.fn() };
    await expect(s.updateRoute(5, 9, { isActive: true })).rejects.toBeInstanceOf(ForbiddenException);
    expect(s.routeRepo.save).not.toHaveBeenCalled();
  });
});
