import { IsArray, IsIn, IsInt, IsOptional, IsString, MinLength } from 'class-validator';

class BusinessDocumentInputDto {
  @IsIn(['brela', 'tin', 'license', 'other'])
  type: 'brela' | 'tin' | 'license' | 'other';

  @IsString()
  url: string;
}

export class CreateSellerProfileDto {
  @IsString()
  @MinLength(3)
  businessName: string;

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
