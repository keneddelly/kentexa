import { CargoClass, CargoRequirements } from './cargo-requirements';

export enum CompatibilityStatus {
  COMPATIBLE = 'compatible',
  INCOMPATIBLE = 'incompatible',
  REQUIRES_CONFIRMATION = 'requires_confirmation',
}

export enum CompatibilityReason {
  WEIGHT_EXCEEDED = 'weight_exceeded',
  VOLUME_EXCEEDED = 'volume_exceeded',
  DIMENSION_EXCEEDED = 'dimension_exceeded',
  CARGO_CLASS_NOT_ACCEPTED = 'cargo_class_not_accepted',
  VEHICLE_CAPABILITY_UNKNOWN = 'vehicle_capability_unknown',
  SPECIAL_HANDLING_UNSUPPORTED = 'special_handling_unsupported',
}

export interface PhysicalCapability {
  maxWeightKg?: number | null;
  maxVolumeM3?: number | null;
  maxItemLengthCm?: number | null;
  maxItemWidthCm?: number | null;
  maxItemHeightCm?: number | null;
  acceptedCargoClasses?: CargoClass[] | null;
  supportsLoadingAssistance?: boolean | null;
  supportsUnloadingAssistance?: boolean | null;
  supportsLiftingEquipment?: boolean | null;
}

export interface CompatibilityResult {
  status: CompatibilityStatus;
  reasons: CompatibilityReason[];
}

export function evaluatePhysicalCompatibility(cargo: CargoRequirements, capability: PhysicalCapability): CompatibilityResult {
  const hard: CompatibilityReason[] = [];
  const unknown: CompatibilityReason[] = [];
  const exceeds = (need: number | null | undefined, cap: number | null | undefined, reason: CompatibilityReason) => {
    if (need == null) return;
    if (cap == null) unknown.push(CompatibilityReason.VEHICLE_CAPABILITY_UNKNOWN);
    else if (need > cap) hard.push(reason);
  };

  exceeds(cargo.weightKg, capability.maxWeightKg, CompatibilityReason.WEIGHT_EXCEEDED);
  exceeds(cargo.volumeM3, capability.maxVolumeM3, CompatibilityReason.VOLUME_EXCEEDED);
  exceeds(cargo.lengthCm, capability.maxItemLengthCm, CompatibilityReason.DIMENSION_EXCEEDED);
  exceeds(cargo.widthCm, capability.maxItemWidthCm, CompatibilityReason.DIMENSION_EXCEEDED);
  exceeds(cargo.heightCm, capability.maxItemHeightCm, CompatibilityReason.DIMENSION_EXCEEDED);

  if (capability.acceptedCargoClasses?.length && !capability.acceptedCargoClasses.includes(cargo.cargoClass)) {
    hard.push(CompatibilityReason.CARGO_CLASS_NOT_ACCEPTED);
  } else if (!capability.acceptedCargoClasses && cargo.cargoClass !== CargoClass.NORMAL) {
    unknown.push(CompatibilityReason.VEHICLE_CAPABILITY_UNKNOWN);
  }

  if (cargo.loadingAssistanceRequired && capability.supportsLoadingAssistance === false) hard.push(CompatibilityReason.SPECIAL_HANDLING_UNSUPPORTED);
  if (cargo.unloadingAssistanceRequired && capability.supportsUnloadingAssistance === false) hard.push(CompatibilityReason.SPECIAL_HANDLING_UNSUPPORTED);
  if (cargo.liftingEquipmentRequired && capability.supportsLiftingEquipment === false) hard.push(CompatibilityReason.SPECIAL_HANDLING_UNSUPPORTED);

  const reasons = [...new Set([...hard, ...unknown])];
  if (hard.length) return { status: CompatibilityStatus.INCOMPATIBLE, reasons };
  if (unknown.length) return { status: CompatibilityStatus.REQUIRES_CONFIRMATION, reasons };
  return { status: CompatibilityStatus.COMPATIBLE, reasons: [] };
}
