import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { ILlmProvider, LlmGenerateRequest, LlmResult } from '../types';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MAX_TOKENS = 1024;

interface AnthropicContentBlock {
  type: string;
  text?: string;
}

interface AnthropicMessagesResponse {
  content: AnthropicContentBlock[];
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

@Injectable()
export class AnthropicProvider implements ILlmProvider {
  readonly name = 'anthropic';
  private readonly logger = new Logger(AnthropicProvider.name);
  private readonly apiKey: string;
  private readonly model: string;

  constructor(private config: ConfigService) {
    this.apiKey = this.config.get<string>('ANTHROPIC_API_KEY') || '';
    this.model =
      this.config.get<string>('ANTHROPIC_MODEL') || 'claude-sonnet-5';
  }

  async generate(request: LlmGenerateRequest): Promise<LlmResult> {
    try {
      const response = await axios.post<AnthropicMessagesResponse>(
        ANTHROPIC_API_URL,
        {
          model: this.model,
          max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
          ...(request.system ? { system: request.system } : {}),
          messages: [{ role: 'user', content: request.prompt }],
        },
        {
          headers: {
            'x-api-key': this.apiKey,
            'anthropic-version': ANTHROPIC_VERSION,
            'content-type': 'application/json',
          },
          timeout: 15000,
        },
      );

      const text = response.data.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text ?? '')
        .join('');

      return {
        text,
        usage: {
          inputTokens: response.data.usage?.input_tokens ?? 0,
          outputTokens: response.data.usage?.output_tokens ?? 0,
        },
        provider: this.name,
        model: this.model,
      };
    } catch (err) {
      const details: unknown = axios.isAxiosError(err)
        ? err.response?.data
        : undefined;
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Anthropic request failed: ${JSON.stringify(details ?? message)}`,
      );
      throw err;
    }
  }
}
