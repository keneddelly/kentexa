import { Injectable } from '@nestjs/common';
import { AiCoreService } from './ai-core.service';
import { AiPromptTemplateService } from './ai-prompt-templates.service';

export interface ParsedSearchQuery {
  keywords: string;
  category?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
}

// Shared by ProductsModule and ClassifiedsModule — has no feature-specific
// repo dependencies, so it lives in AiModule rather than duplicating it.
@Injectable()
export class AiSearchParserService {
  constructor(
    private aiCore: AiCoreService,
    private prompts: AiPromptTemplateService,
  ) {}

  async parse(query: string): Promise<ParsedSearchQuery> {
    const template = this.prompts.searchParsePrompt();
    return this.aiCore.complete<ParsedSearchQuery>({
      workflow: 'search-parse',
      template,
      user: query,
      cacheKey: `search-parse:${query.trim().toLowerCase()}`,
      effort: 'low',
      thinking: false,
    });
  }
}
