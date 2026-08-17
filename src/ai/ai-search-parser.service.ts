import { Injectable } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiPromptTemplateService } from './ai-prompt-templates.service';

export type SearchDomain =
  | 'product'
  | 'classified'
  | 'service'
  | 'transport'
  | 'people'
  | 'all';

export interface ParsedSearchQuery {
  domain: SearchDomain;
  keywords: string;
  category?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  fromCity?: string | null;
  toCity?: string | null;
}

// Shared by ProductsModule and ClassifiedsModule — has no feature-specific
// repo dependencies, so it lives in AiModule rather than duplicating it.
@Injectable()
export class AiSearchParserService {
  constructor(
    private aiService: AiService,
    private prompts: AiPromptTemplateService,
  ) {}

  async parse(query: string): Promise<ParsedSearchQuery> {
    const template = this.prompts.searchParsePrompt();
    const result = await this.aiService.generate<ParsedSearchQuery>({
      task: 'search-parse',
      prompt: query,
      system: template.system,
      schema: template.schema,
      schemaName: template.schemaName,
      cacheKey: `search-parse:${query.trim().toLowerCase()}`,
    });
    return result.data;
  }
}
