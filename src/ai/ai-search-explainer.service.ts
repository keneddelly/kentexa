import { Injectable } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiPromptTemplateService } from './ai-prompt-templates.service';

export interface SearchResultSummary {
  domain: string;
  counts: Record<string, number>;
  topItems: Array<{
    type: string;
    name: string;
    subtitle?: string | null;
    price?: number | null;
    rating?: number | null;
  }>;
}

export interface ExplainedSearch {
  summary: string;
  suggestions: string[];
}

// The conversational half of unified search — searchParsePrompt (in
// AiSearchParserService) decides WHERE to search before any results exist;
// this explains what was actually found, after the fact. Two separate AI
// calls because the second one is meaningless without real result data.
@Injectable()
export class AiSearchExplainerService {
  constructor(
    private aiService: AiService,
    private prompts: AiPromptTemplateService,
  ) {}

  async explain(
    query: string,
    resultSummary: SearchResultSummary,
  ): Promise<ExplainedSearch> {
    const template = this.prompts.searchExplainPrompt();
    const payload = JSON.stringify({ query, ...resultSummary });
    const result = await this.aiService.generate<ExplainedSearch>({
      task: 'search-explain',
      prompt: payload,
      system: template.system,
      schema: template.schema,
      schemaName: template.schemaName,
      // Not cached by query alone — the same query can return a very
      // different result summary depending on live inventory, so the
      // cache key has to include what was actually found.
      cacheKey: `search-explain:${payload}`,
    });
    return result.data;
  }
}
