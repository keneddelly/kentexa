import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { AiRefusalError } from '../ai-safety.service';
import {
  AiGenerateRequest,
  AiGenerateResponse,
  AiProvider,
} from '../interfaces/ai-provider.interface';

// The only place in the codebase that talks to the Anthropic API directly.
// Registered in AiProviderRegistry only when ANTHROPIC_API_KEY is set.
@Injectable()
export class AnthropicProvider implements AiProvider {
  readonly name = 'anthropic';
  private readonly logger = new Logger(AnthropicProvider.name);
  private readonly client: Anthropic | null;

  constructor(private config: ConfigService) {
    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
    this.client = apiKey ? new Anthropic({ apiKey }) : null;
  }

  get isConfigured(): boolean {
    return this.client !== null;
  }

  async generate<T = unknown>(
    req: AiGenerateRequest,
  ): Promise<AiGenerateResponse<T>> {
    if (!this.client) {
      throw new Error('Anthropic provider is not configured (no API key).');
    }

    const response = await this.client.beta.messages.create({
      model: req.model,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      max_tokens: req.maxTokens ?? 1024,
      system: [
        {
          type: 'text',
          text: req.system ?? '',
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          content: req.images?.length
            ? [
                ...req.images.map((url) => ({
                  type: 'image' as const,
                  source: { type: 'url' as const, url },
                })),
                { type: 'text' as const, text: req.prompt },
              ]
            : req.prompt,
        },
      ],
      ...(req.schema
        ? {
            output_config: {
              effort: 'medium',
              format: {
                type: 'json_schema',
                name: req.schemaName ?? 'response',
                schema: req.schema,
              },
            },
          }
        : {}),
    } as any);

    if ((response as any).stop_reason === 'refusal') {
      const category = (response as any).stop_details?.category ?? null;
      this.logger.warn(`AI request refused (category: ${category})`);
      throw new AiRefusalError(category);
    }

    const textBlock = (response as any).content?.find(
      (b: any) => b.type === 'text',
    );

    let data: T;
    if (req.schema) {
      try {
        data = JSON.parse(textBlock?.text ?? '{}');
      } catch {
        throw new AiRefusalError(null, 'AI response was not valid JSON.');
      }
    } else {
      data = (textBlock?.text ?? '') as unknown as T;
    }

    const usage = (response as any).usage || {};
    return {
      data,
      provider: this.name,
      model: req.model,
      usage: {
        inputTokens: usage.input_tokens ?? 0,
        outputTokens: usage.output_tokens ?? 0,
        cacheReadTokens: usage.cache_read_input_tokens ?? 0,
      },
    };
  }
}
