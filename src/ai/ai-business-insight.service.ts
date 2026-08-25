import { Injectable } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiPromptTemplateService } from './ai-prompt-templates.service';

export interface BusinessInsight {
  insight: string;
  recommendation: string | null;
  confidence: number;
}

// Layer 4 of CLAUDE.md's Internal AI Intelligence architecture — real AI
// reasoning on top of BusinessService.getTodayIntelligence()'s Layer 2
// counts (Phase 2). Same shape as AiSearchExplainerService: a separate,
// non-blocking call the frontend makes AFTER the deterministic report
// already rendered, never a dependency of it.
@Injectable()
export class AiBusinessInsightService {
  constructor(
    private aiService: AiService,
    private prompts: AiPromptTemplateService,
  ) {}

  async generate(
    today: Record<string, any>,
    language: string,
  ): Promise<BusinessInsight> {
    const template = this.prompts.businessInsightPrompt();
    const payload = JSON.stringify({ today, language });
    const result = await this.aiService.generate<BusinessInsight>({
      task: 'business-insight',
      prompt: payload,
      system: template.system,
      schema: template.schema,
      schemaName: template.schemaName,
      // Cached by the actual numbers + language, not a fixed key — a
      // different day's counts must never return a stale cached insight.
      cacheKey: `business-insight:${payload}`,
    });
    return result.data;
  }
}
