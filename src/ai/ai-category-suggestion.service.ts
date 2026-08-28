import { Injectable } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiPromptTemplateService } from './ai-prompt-templates.service';
import { SuggestCategoryDto } from './dto/suggest-category.dto';
import { CATEGORIES } from '../categories/categories.data';

export interface CategorySuggestion {
  category: string;
  subcategory: string;
  confidence: 'high' | 'medium' | 'low';
}

// Deliberately its own service, not a thinner call into AiListingService
// (which already returns category/subcategory alongside a generated
// name/description/features) — this fires automatically as a seller types
// a title, so it needs to be the cheapest, fastest call that answers only
// the one question asked, not incidentally regenerate the whole listing.
@Injectable()
export class AiCategorySuggestionService {
  constructor(
    private aiService: AiService,
    private prompts: AiPromptTemplateService,
  ) {}

  async suggest(input: SuggestCategoryDto): Promise<CategorySuggestion> {
    const prompt = [input.title, input.details]
      .filter((p) => p && p.trim())
      .join('\n');

    const template = this.prompts.categorySuggestPrompt();
    const result = await this.aiService.generate<CategorySuggestion>({
      task: 'category-suggest',
      prompt,
      system: template.system,
      schema: template.schema,
      schemaName: template.schemaName,
      // Repeated identical titles (very common — sellers retype/copy
      // similar listings) hit the cache instead of a fresh LLM call.
      cacheKey: `category-suggest:${prompt.trim().toLowerCase()}`,
    });

    // The model is told the real subcategory keys but isn't hard-
    // constrained to them (no clean cross-field enum in JSON Schema) — if
    // it returned something that isn't an actual key under the chosen
    // category, drop it rather than let a made-up subcategory string
    // reach the picker as if it were a real option.
    const validSubcategories = CATEGORIES[result.data.category]?.subcategories || {};
    const subcategory = validSubcategories[result.data.subcategory]
      ? result.data.subcategory
      : '';

    return { ...result.data, subcategory };
  }
}
