import { JourneyCompatibilityService } from './journey-compatibility.service';
import { CargoClass, CargoEvidenceLevel, CompatibilityReason, CompatibilityStatus } from './journey-contract';

describe('JourneyCompatibilityService', () => {
  const svc = new JourneyCompatibilityService();
  const cargo = {
    description: 'parcel',
    cargoClass: CargoClass.NORMAL,
    evidenceLevel: CargoEvidenceLevel.DECLARED,
    weightKg: 10,
  };

  it('accepts cargo within known hard capability', () => {
    expect(svc.evaluate(cargo, { maxWeightKg: 20 })).toEqual({ status: CompatibilityStatus.COMPATIBLE, reasons: [] });
  });

  it('rejects cargo over hard weight capacity', () => {
    const result = svc.evaluate({ ...cargo, weightKg: 30 }, { maxWeightKg: 20 });
    expect(result.status).toBe(CompatibilityStatus.INCOMPATIBLE);
    expect(result.reasons).toContain(CompatibilityReason.WEIGHT_EXCEEDED);
  });

  it('requires confirmation when dimensional capability is unknown', () => {
    const result = svc.evaluate({ ...cargo, lengthCm: 250 }, { maxWeightKg: 20 });
    expect(result.status).toBe(CompatibilityStatus.REQUIRES_CONFIRMATION);
    expect(result.reasons).toContain(CompatibilityReason.VEHICLE_CAPABILITY_UNKNOWN);
  });

  it('rejects an unaccepted cargo class', () => {
    const result = svc.evaluate(
      { ...cargo, cargoClass: CargoClass.OVERSIZED },
      { maxWeightKg: 20, acceptedCargoClasses: [CargoClass.NORMAL] },
    );
    expect(result.status).toBe(CompatibilityStatus.INCOMPATIBLE);
    expect(result.reasons).toContain(CompatibilityReason.CARGO_CLASS_NOT_ACCEPTED);
  });
});
