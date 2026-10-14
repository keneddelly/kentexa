import { BadRequestException } from '@nestjs/common';

/**
 * Msafirishaji sign-up on one screen (owner 2026-10-14): bus, truck or van
 * (boda and courier sign up as Wakala), the vehicle's plate and capacity, and
 * the main route from the place list. The LATRA licence / registration number
 * is optional. Prices are set only after approval, so the main route is
 * created switched off and without a price.
 */
export const MSAFIRISHAJI_TYPES = ['bus', 'truck', 'van'] as const;
export type MsafirishajiType = (typeof MSAFIRISHAJI_TYPES)[number];

export const MSAFIRISHAJI_MESSAGES = {
  type: 'Chagua aina: basi, lori au van.',
  name: 'Andika jina la biashara yako ya usafiri.',
  plate: 'Andika namba ya usajili wa gari (plate number).',
  capacity: 'Andika uzito wa juu gari linaweza kubeba (kilo).',
  from: 'Chagua njia unakoanzia kutoka kwenye orodha.',
  to: 'Chagua njia unakokwenda kutoka kwenye orodha.',
  sameEnds: 'Mwanzo na mwisho wa njia haviwezi kuwa sehemu moja.',
  noPhone: 'Akaunti yako haina namba ya simu. Iweke kwenye akaunti kwanza.',
} as const;

export interface PlaceRef { providerKey?: unknown; providerPlaceId?: unknown }
export interface ResolvedPlace { regionName?: string | null; regionId?: number | null; displayLabel?: string | null }

export interface MsafirishajiInput {
  name?: unknown; type?: unknown; registrationNumber?: unknown;
  vehicle?: { registrationPlate?: unknown; weightCapacityKg?: unknown; parcelCapacity?: unknown };
  route?: { from?: PlaceRef; to?: PlaceRef };
}

export interface MsafirishajiSignup {
  name: string; type: MsafirishajiType; registrationNumber: string | null; phone: string;
  vehicle: { registrationPlate: string; weightCapacityKg: number; parcelCapacity: number | null };
  route: { originCity: string; originRegionId: number | null; destinationCity: string; destinationRegionId: number | null };
}

const isRef = (r?: PlaceRef) => !!r && typeof r.providerKey === 'string' && typeof r.providerPlaceId === 'string';

/** Validates the one-screen sign-up and resolves the route ends; throws a Swahili message for each missing part. */
export async function readMsafirishajiSignup(
  dto: MsafirishajiInput,
  accountPhone: string | null | undefined,
  resolve: (ref: { providerKey: string; providerPlaceId: string }) => Promise<ResolvedPlace | null>,
): Promise<MsafirishajiSignup> {
  const type = String(dto.type ?? '').trim() as MsafirishajiType;
  if (!MSAFIRISHAJI_TYPES.includes(type)) throw new BadRequestException(MSAFIRISHAJI_MESSAGES.type);
  const name = String(dto.name ?? '').trim().slice(0, 120);
  if (name.length < 2) throw new BadRequestException(MSAFIRISHAJI_MESSAGES.name);
  const plate = String(dto.vehicle?.registrationPlate ?? '').trim().toUpperCase().slice(0, 40);
  if (plate.length < 3) throw new BadRequestException(MSAFIRISHAJI_MESSAGES.plate);
  const kg = Number(dto.vehicle?.weightCapacityKg);
  if (!Number.isFinite(kg) || kg <= 0 || kg > 100000) throw new BadRequestException(MSAFIRISHAJI_MESSAGES.capacity);
  const parcels = dto.vehicle?.parcelCapacity == null || dto.vehicle?.parcelCapacity === '' ? null : Number(dto.vehicle.parcelCapacity);
  const phone = String(accountPhone ?? '').trim();
  if (!phone) throw new BadRequestException(MSAFIRISHAJI_MESSAGES.noPhone);
  const from = isRef(dto.route?.from) ? await resolve(dto.route!.from as any).catch(() => null) : null;
  if (!from?.regionName) throw new BadRequestException(MSAFIRISHAJI_MESSAGES.from);
  const to = isRef(dto.route?.to) ? await resolve(dto.route!.to as any).catch(() => null) : null;
  if (!to?.regionName) throw new BadRequestException(MSAFIRISHAJI_MESSAGES.to);
  if ((from.displayLabel || from.regionName) === (to.displayLabel || to.regionName)) throw new BadRequestException(MSAFIRISHAJI_MESSAGES.sameEnds);
  const licence = String(dto.registrationNumber ?? '').trim().slice(0, 60);
  return {
    name, type, registrationNumber: licence || null, phone,
    vehicle: { registrationPlate: plate, weightCapacityKg: kg, parcelCapacity: Number.isFinite(parcels as number) && (parcels as number) > 0 ? Math.round(parcels as number) : null },
    route: { originCity: from.regionName, originRegionId: from.regionId ?? null, destinationCity: to.regionName, destinationRegionId: to.regionId ?? null },
  };
}
