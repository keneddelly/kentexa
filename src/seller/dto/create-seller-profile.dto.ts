import { IsArray, IsIn, IsInt, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';

class BusinessDocumentInputDto {
  @IsIn(['brela', 'tin', 'license', 'other'])
  type: 'brela' | 'tin' | 'license' | 'other';

  @IsString()
  url: string;
}

export class CreateSellerProfileDto {
  // Required only for sellerType === 'business' — a registered business
  // genuinely needs a name to operate under. An individual selling
  // personal items has no such requirement (SellerService.apply()
  // defaults it from the account's own name when omitted); forcing
  // "Business Name" on everyone regardless of sellerType was the exact
  // bug this DTO existed to fix nowhere near — see
  // project_sell_intent_business_onboarding_2026_08 memory.
  @ValidateIf((o) => o.sellerType === 'business')
  @IsString()
  @MinLength(3)
  businessName?: string;

  @IsOptional()
  @IsString()
  businessDescription?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  businessCategory?: string;

  @IsOptional()
  @IsString()
  registrationNumber?: string;

  @IsOptional()
  @IsInt()
  regionId?: number;

  @IsOptional()
  @IsString()
  businessRegion?: string;

  @IsOptional()
  @IsInt()
  districtId?: number;

  @IsOptional()
  @IsString()
  businessDistrict?: string;

  @IsOptional()
  @IsInt()
  wardId?: number;

  @IsOptional()
  @IsString()
  businessCity?: string;

  // ── Business verification (Phase 2) ────────────────────────────────────
  @IsOptional()
  @IsIn(['individual', 'business'])
  sellerType?: 'individual' | 'business';

  @IsOptional()
  @IsString()
  tinNumber?: string;

  @IsOptional()
  @IsString()
  businessLicenseNumber?: string;

  @IsOptional()
  @IsArray()
  businessDocuments?: BusinessDocumentInputDto[];
}
