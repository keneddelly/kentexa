import { Injectable } from '@nestjs/common';
import { CargoRequirements, CompatibilityReason, CompatibilityResult, CompatibilityStatus } from './journey-contract';

export interface PhysicalCapability {
  maxWeightKg?: number | null;
  maxVolumeM3?: number | null;
  maxLengthCm?: number | null;
  maxWidthCm?: number | null;
  maxHeightCm?: number | null;
  acceptedCargoClasses?: string[] | null;
  supportsLoadingAssistance?: boolean | null;
  supportsUnloadingAssistance?: boolean | null;
  supportsLiftingEquipment?: boolean | null;
}

@Injectable()
export class JourneyCompatibilityService {
  evaluate(cargo: CargoRequirements, capability: PhysicalCapability): CompatibilityResult {
    const hard: CompatibilityReason[] = [];
    const confirm: CompatibilityReason[] = [];

    if (cargo.weightKg != null) {
      if (capability.maxWeightKg == null) confirm.push(CompatibilityReason.VEHICLE_CAPABILITY_UNKNOWN);
      else if (cargo.weightKg > Number(capability.maxWeightKg)) hard.push(CompatibilityReason.WEIGHT_EXCEEDED);
    }
    if (cargo.volumeM3 != null) {
      if (capability.maxVolumeM3 == null) confirm.push(CompatibilityReason.VEHICLE_CAPABILITY_UNKNOWN);
      else if (cargo.volumeM3 > Number(capability.maxVolumeM3)) hard.push(CompatibilityReason.VOLUME_EXCEEDED);
    }

    const dims: Array<[number | undefined, number | null | undefined]> = [
      [cargo.lengthCm, capability.maxLengthCm],
      [cargo.widthCm, capability.maxWidthCm],
      [cargo.heightCm, capability.maxHeightCm],
    ];
    for (const [need, max] of dims) {
      if (need == null) continue;
      if (max == null) confirm.push(CompatibilityReason.VEHICLE_CAPABILITY_UNKNOWN);
      else if (need > Number(max)) hard.push(CompatibilityReason.DIMENSION_EXCEEDED);
    }

    if (capability.acceptedCargoClasses?.length && !capability.acceptedCargoClasses.includes(cargo.cargoClass)) {
      hard.push(CompatibilityReason.CARGO_CLASS_NOT_ACCEPTED);
    }
    if (cargo.loadingAssistanceRequired && capability.supportsLoadingAssistance !== true) {
      (capability.supportsLoadingAssistance === false ? hard : confirm).push(CompatibilityReason.SPECIAL_HANDLING_UNSUPPORTED);
    }
    if (cargo.unloadingAssistanceRequired && capability.supportsUnloadingAssistance !== true) {
      (capability.supportsUnloadingAssistance === false ? hard : confirm).push(CompatibilityReason.SPECIAL_HANDLING_UNSUPPORTED);
    }
    if (cargo.liftingEquipmentRequired && capability.supportsLiftingEquipment !== true) {
      (capability.supportsLiftingEquipment === false ? hard : confirm).push(CompatibilityReason.SPECIAL_HANDLING_UNSUPPORTED);
    }

    const reasons = [...new Set([...hard, ...confirm])];
    if (hard.length) return { status: CompatibilityStatus.INCOMPATIBLE, reasons };
    if (confirm.length) return { status: CompatibilityStatus.REQUIRES_CONFIRMATION, reasons };
    return { status: CompatibilityStatus.COMPATIBLE, reasons: [] };
  }
}
