import { CargoClass, CargoEvidenceLevel } from './cargo-requirements';
import { CompatibilityReason, CompatibilityStatus, evaluatePhysicalCompatibility } from './compatibility';

const cargo = (overrides: any = {}) => ({
  description: 'parcel',
  cargoClass: CargoClass.NORMAL,
  quantity: 1,
  weightKg: 10,
  evidenceLevel: CargoEvidenceLevel.DECLARED,
  capturedAt: new Date(0).toISOString(),
  ...overrides,
});

describe('L1 physical compatibility', () => {
  it('accepts cargo that fits known capability', () => {
    expect(evaluatePhysicalCompatibility(cargo(), {
      maxWeightKg: 20,
      acceptedCargoClasses: [CargoClass.NORMAL],
    })).toEqual({ status: CompatibilityStatus.COMPATIBLE, reasons: [] });
  });

  it('rejects a hard physical mismatch before pricing', () => {
    const result = evaluatePhysicalCompatibility(cargo({ weightKg: 30 }), {
      maxWeightKg: 20,
      acceptedCargoClasses: [CargoClass.NORMAL],
    });
    expect(result.status).toBe(CompatibilityStatus.INCOMPATIBLE);
    expect(result.reasons).toContain(CompatibilityReason.WEIGHT_EXCEEDED);
  });

  it('requires confirmation for oversized cargo when dimensions are unknown', () => {
    const result = evaluatePhysicalCompatibility(cargo({
      cargoClass: CargoClass.OVERSIZED,
      lengthCm: 250,
    }), { maxWeightKg: 5000 });
    expect(result.status).toBe(CompatibilityStatus.REQUIRES_CONFIRMATION);
    expect(result.reasons).toContain(CompatibilityReason.VEHICLE_CAPABILITY_UNKNOWN);
  });

  it('rejects unsupported special handling', () => {
    const result = evaluatePhysicalCompatibility(cargo({ liftingEquipmentRequired: true }), {
      maxWeightKg: 20,
      acceptedCargoClasses: [CargoClass.NORMAL],
      supportsLiftingEquipment: false,
    });
    expect(result.status).toBe(CompatibilityStatus.INCOMPATIBLE);
    expect(result.reasons).toContain(CompatibilityReason.SPECIAL_HANDLING_UNSUPPORTED);
  });
});
