import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { CargoClass, CargoEvidenceLevel, normalizeCargoRequirements } from './cargo-requirements';
import { ShipmentsService } from '../../shipments/shipments.service';

// Send form v2 (owner 2026-10-23): the sender's declared value travels in the
// journey's cargo details and is copied once onto the Parcel at confirmation.
const base = {
  description: 'Nguo', cargoClass: CargoClass.NORMAL, quantity: 2, weightKg: 2,
  evidenceLevel: CargoEvidenceLevel.DECLARED, capturedAt: '2026-10-23T09:00:00.000Z',
};

describe('cargo details: declared value', () => {
  it('kept (whole shillings), or null when not given', () => {
    expect(normalizeCargoRequirements({ ...base, declaredValue: 150000.4 }).declaredValue).toBe(150000);
    expect(normalizeCargoRequirements({ ...base }).declaredValue).toBeNull();
    expect(normalizeCargoRequirements({ ...base, declaredValue: 0 }).declaredValue).toBe(0);
  });

  it('a negative, absurd or non-number value is refused', () => {
    for (const bad of [-1, 1e12, Number.NaN, '150000' as any]) {
      expect(() => normalizeCargoRequirements({ ...base, declaredValue: bad })).toThrow(BadRequestException);
    }
  });

  it('pieces and handling notes pass through; the class stays normal', () => {
    const out = normalizeCargoRequirements({ ...base, fragile: true, specialHandlingNotes: ' Kinavunjika ' });
    expect(out).toMatchObject({ quantity: 2, fragile: true, specialHandlingNotes: 'Kinavunjika', cargoClass: 'normal' });
  });
});

describe('parcel at confirmation: declared value from the journey', () => {
  const read = (rows: any[]) => {
    const query = jest.fn(async () => rows);
    const parcels: any = { manager: { query } };
    return { query, run: (id: number | null) => (ShipmentsService.prototype as any).declaredValueFromJourney.call({}, parcels, id) };
  };

  it('copies a positive value; none, zero or no journey is null', async () => {
    expect(await read([{ v: '150000' }]).run(900)).toBe(150000);
    expect(await read([{ v: null }]).run(900)).toBeNull();
    expect(await read([{ v: '0' }]).run(900)).toBeNull();
    const none = read([{ v: '5' }]);
    expect(await none.run(null)).toBeNull();
    expect(none.query).not.toHaveBeenCalled();
  });
});
