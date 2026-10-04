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
  cargoClass: CargoClass;
  quantity: number;
  weightKg?: number | null;
  lengthCm?: number | null;
  widthCm?: number | null;
  heightCm?: number | null;
  volumeM3?: number | null;
  mustRemainUpright?: boolean;
  fragile?: boolean;
  loadingAssistanceRequired?: boolean;
  unloadingAssistanceRequired?: boolean;
  liftingEquipmentRequired?: boolean;
  specialHandlingNotes?: string | null;
  photoUrls?: string[];
  evidenceLevel: CargoEvidenceLevel;
  capturedAt: string;
}

export function normalizeCargoRequirements(input: CargoRequirements): CargoRequirements {
  if (!input?.description?.trim()) throw new Error('Cargo description is required');
  if (!Number.isInteger(input.quantity) || input.quantity < 1) throw new Error('Cargo quantity must be at least 1');
  for (const [key, value] of Object.entries({
    weightKg: input.weightKg,
    lengthCm: input.lengthCm,
    widthCm: input.widthCm,
    heightCm: input.heightCm,
    volumeM3: input.volumeM3,
  })) {
    if (value != null && (!Number.isFinite(value) || value < 0)) throw new Error(`${key} must be a non-negative number`);
  }
  return {
    ...input,
    description: input.description.trim(),
    specialHandlingNotes: input.specialHandlingNotes?.trim() || null,
    photoUrls: [...new Set(input.photoUrls ?? [])],
    capturedAt: input.capturedAt || new Date().toISOString(),
  };
}
