import { IsArray, IsOptional, IsString, ArrayMinSize } from 'class-validator';

// Shared by /products/ai/generate-description and
// /classifieds/ai/generate-description — both forms ask for the same
// thing (title + uploaded photo URLs [+ optional category] -> description).
export class GenerateDescriptionDto {
  @IsString()
  title: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  imageUrls: string[];

  @IsOptional()
  @IsString()
  categoryHint?: string;
}
