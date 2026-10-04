export enum CargoClass {
  NORMAL = 'normal',
  BULKY = 'bulky',
  OVERSIZED = 'oversized',
  FRAGILE = 'fragile',
  TEMPERATURE_SENSITIVE = 'temperature_sensitive',
  RESTRICTED = 'restricted',
  OTHER = 'other',
}

export enum CargoEvidenceLevel {
  DECLARED = 'declared',
  VERIFIED = 'verified',
  DERIVED = 'derived',
}

export interface CargoRequirements {
  description: string;
  quantity?: number;
  weightKg?: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  volumeM3?: number;
  cargoClass: CargoClass;
  fragile?: boolean;
  keepUpright?: boolean;
  loadingAssistanceRequired?: boolean;
  unloadingAssistanceRequired?: boolean;
  liftingEquipmentRequired?: boolean;
  specialHandlingNotes?: string;
  photoUrls?: string[];
  evidenceLevel: CargoEvidenceLevel;
}

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
  AGENT_OUTSIDE_COVERAGE = 'agent_outside_coverage',
  AGENT_OFFLINE = 'agent_offline',
  SERVICE_NOT_AVAILABLE = 'service_not_available',
  CAPACITY_UNAVAILABLE = 'capacity_unavailable',
  SPECIAL_HANDLING_UNSUPPORTED = 'special_handling_unsupported',
  MANUAL_QUOTE_REQUIRED = 'manual_quote_required',
}

export interface CompatibilityResult {
  status: CompatibilityStatus;
  reasons: CompatibilityReason[];
}

export enum JourneyLegType {
  FIRST_MILE = 'first_mile',
  HUB_INTAKE = 'hub_intake',
  TRANSPORT = 'transport',
  TRANSFER = 'transfer',
  LAST_MILE = 'last_mile',
  CUSTOMER_PICKUP = 'customer_pickup',
}

export enum JourneyActorType {
  AGENT = 'agent',
  SUPER_AGENT = 'super_agent',
  TRANSPORT_PROVIDER = 'transport_provider',
  CUSTOMER = 'customer',
}

export enum JourneyCommitmentLevel {
  SERVICE_CONFIRMED = 'service_confirmed',
  RUN_CONFIRMED = 'run_confirmed',
  VEHICLE_CONFIRMED = 'vehicle_confirmed',
}
