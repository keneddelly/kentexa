import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { AiRefusalError } from './ai-safety.service';

export interface CompleteParams {
  system: string;
  user: string;
  schema: Record<string, any>;
  schemaName: string;
  model: string;
  effort?: 'low' | 'medium' | 'high';
  thinking?: boolean;
  maxTokens?: number;
}

export interface CompleteResult<T = any> {
  data: T;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
  };
}

// Provider Adapter — the only place in the codebase that talks to the
// Anthropic API. Swapping providers later means changing this file only.
@Injectable()
export class AnthropicProviderAdapter {
  private readonly logger = new Logger(AnthropicProviderAdapter.name);
  private readonly client: Anthropic;

  constructor(private config: ConfigService) {
    this.client = new Anthropic({
      apiKey: this.config.get<string>('ANTHROPIC_API_KEY'),
    });
  }

  async complete<T = any>(params: CompleteParams): Promise<CompleteResult<T>> {
    const response = await this.client.beta.messages.create({
      model: params.model,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      max_tokens: params.maxTokens ?? 1024,
      system: [
        {
          type: 'text',
          text: params.system,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: params.user }],
      output_config: {
        effort: params.effort ?? 'medium',
        format: {
          type: 'json_schema',
          name: params.schemaName,
          schema: params.schema,
        },
      },
      ...(params.thinking === false
        ? { thinking: { type: 'disabled' } }
        : {}),
    } as any);

    if ((response as any).stop_reason === 'refusal') {
      const category =
        (response as any).stop_details?.category ?? null;
      this.logger.warn(`AI request refused (category: ${category})`);
      throw new AiRefusalError(category);
    }

    const textBlock = (response as any).content?.find(
      (b: any) => b.type === 'text',
    );
    let data: T;
    try {
      data = JSON.parse(textBlock?.text ?? '{}');
    } catch {
      throw new AiRefusalError(null, 'AI response was not valid JSON.');
    }

    const usage = (response as any).usage || {};
    return {
      data,
      usage: {
        inputTokens: usage.input_tokens ?? 0,
        outputTokens: usage.output_tokens ?? 0,
        cacheReadTokens: usage.cache_read_input_tokens ?? 0,
      },
    };
  }
}
