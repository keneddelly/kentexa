import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { AnthropicProvider } from './providers/anthropic.provider';
import { MockLlmProvider } from './providers/mock.provider';
import { ILlmProvider, LlmGenerateRequest, LlmResult } from './types';

// ─────────────────────────────────────────────────────────────────────────
// Kentexa AI Core — the LLM gateway. Owns provider selection, retries and
// usage logging. Domain code should never depend on this directly; it's
// internal to AiCoreModule and only reachable through AiOrchestratorService.
// ─────────────────────────────────────────────────────────────────────────
@Injectable()
export class AiCoreService {
  private readonly logger = new Logger(AiCoreService.name);
  private readonly provider: ILlmProvider;

  constructor(
    config: ConfigService,
    anthropic: AnthropicProvider,
    mock: MockLlmProvider,
  ) {
    const hasKey = !!config.get<string>('ANTHROPIC_API_KEY');
    this.provider = hasKey ? anthropic : mock;
    if (!hasKey) {
      this.logger.warn(
        '[AiCore] No ANTHROPIC_API_KEY set — using mock provider',
      );
    }
  }

  private isRetryable(err: unknown): boolean {
    if (!axios.isAxiosError(err)) return false;
    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') return true;
    const status = err.response?.status;
    return typeof status === 'number' && status >= 500;
  }

  async generate(request: LlmGenerateRequest): Promise<LlmResult> {
    let result: LlmResult;
    try {
      result = await this.provider.generate(request);
    } catch (err) {
      if (!this.isRetryable(err)) throw err;
      this.logger.warn(
        `[AiCore] ${this.provider.name} call failed, retrying once`,
      );
      result = await this.provider.generate(request);
    }

    this.logger.log(
      `[AiCore] provider=${result.provider} model=${result.model} ` +
        `tokens_in=${result.usage.inputTokens} tokens_out=${result.usage.outputTokens}`,
    );
    return result;
  }
}
