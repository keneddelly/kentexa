import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AnthropicProviderAdapter } from './anthropic-provider.adapter';
import { AiSafetyService } from './ai-safety.service';
import { AiCacheService } from './ai-cache.service';
import { AiCostLogService } from './ai-cost-log.service';
import { PromptTemplate } from './ai-prompt-templates.service';

export type AiWorkflow =
  | 'moderation'
  | 'summary'
  | 'reply-draft'
  | 'product-listing'
  | 'search-parse';

export interface AiCompleteOptions {
  workflow: AiWorkflow;
  template: PromptTemplate;
  user: string;
  cacheKey?: string;
  userId?: number | null;
  effort?: 'low' | 'medium' | 'high';
  thinking?: boolean;
}

const WORKFLOW_MODEL_ENV: Record<AiWorkflow, string> = {
  moderation: 'AI_MODEL_MODERATION',
  'search-parse': 'AI_MODEL_SEARCH',
  'product-listing': 'AI_MODEL_PRODUCT',
  summary: 'AI_MODEL_PRODUCT',
  'reply-draft': 'AI_MODEL_PRODUCT',
};

// The facade every workflow calls — this is the "AI Orchestrator" from the
// architecture diagram, realized as an in-process service rather than a
// separate HTTP hop, since every caller lives in this same backend.
@Injectable()
export class AiCoreService {
  private readonly logger = new Logger(AiCoreService.name);
  private readonly defaultModel: string;

  constructor(
    private config: ConfigService,
    private adapter: AnthropicProviderAdapter,
    private safety: AiSafetyService,
    private cache: AiCacheService,
    private costLog: AiCostLogService,
  ) {
    this.defaultModel =
      this.config.get<string>('AI_MODEL_DEFAULT') || 'claude-opus-5';
  }

  async complete<T = any>(opts: AiCompleteOptions): Promise<T> {
    this.safety.assertInputLength(opts.user);

    if (opts.cacheKey) {
      const cached = this.cache.get<T>(opts.cacheKey);
      if (cached !== undefined) return cached;
    }

    const model =
      this.config.get<string>(WORKFLOW_MODEL_ENV[opts.workflow]) ||
      this.defaultModel;

    const result = await this.adapter.complete<T>({
      system: opts.template.system,
      user: opts.user,
      schema: opts.template.schema,
      schemaName: opts.template.schemaName,
      model,
      effort: opts.effort,
      thinking: opts.thinking,
    });

    this.safety.validateAgainstSchema(result.data, opts.template.schema);

    this.costLog
      .record({
        workflow: opts.workflow,
        userId: opts.userId,
        model,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        cacheReadTokens: result.usage.cacheReadTokens,
      })
      .catch((err) =>
        this.logger.warn(`Cost log failed: ${err.message}`),
      );

    if (opts.cacheKey) this.cache.set(opts.cacheKey, result.data);

    return result.data;
  }
}
