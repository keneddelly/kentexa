import { IsOptional, IsString } from 'class-validator';

// Shared by /products/ai/suggest-category and
// /classifieds/ai/suggest-category — title (+ an optional short extra
// detail, e.g. a description snippet) -> a best-guess category/subcategory
// key, so a seller doesn't have to manually scan all 36 top-level
// categories while creating a listing.
export class SuggestCategoryDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  details?: string;
}
