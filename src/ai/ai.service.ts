import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiRouter, AiTask } from './ai.router';
import { AiSafetyService } from './ai-safety.service';
import { AiCacheService } from './ai-cache.service';
import { AiUsageLogService, UsageLogEntry } from './ai-usage-log.service';
import {
  AiGenerateRequest,
  AiGenerateResponse,
  AiProvider,
} from './interfaces/ai-provider.interface';

export interface AiGenerateOptions {
  task: AiTask;
  prompt: string;
  system?: string;
  schema?: Record<string, any>;
  schemaName?: string;
  userId?: number | null;
  cacheKey?: string;
  maxTokens?: number;
  temperature?: number;
  images?: string[];
}

// Thrown only after every retry/fallback attempt is exhausted. Never
// wraps prompt content — just enough for the caller to show a clean error.
export class AiGenerationFailedError extends Error {
  constructor(task: string, cause: string) {
    super(`AI request for "${task}" failed: ${cause}`);
    this.name = 'AiGenerationFailedError';
  }
}

// The ONLY entry point the rest of Kentexa calls. Nothing downstream of
// here knows or cares whether the request lands on Anthropic, OpenAI,
// DeepSeek, or Qwen — that's entirely AiRouter's decision.
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly requestTimeoutMs: number;

  constructor(
    private router: AiRouter,
    private safety: AiSafetyService,
    private cache: AiCacheService,
    private usageLog: AiUsageLogService,
    private config: ConfigService,
  ) {
    this.requestTimeoutMs = Number(
      this.config.get<string>('AI_REQUEST_TIMEOUT_MS') || 15000,
    );
  }

  async generate<T = unknown>(
    opts: AiGenerateOptions,
  ): Promise<AiGenerateResponse<T>> {
    this.safety.assertInputLength(opts.prompt);

    if (opts.cacheKey) {
      const cached = this.cache.get<AiGenerateResponse<T>>(opts.cacheKey);
      if (cached !== undefined) return cached;
    }

    const route = this.router.resolve(opts.task);
    const baseRequest: AiGenerateRequest = {
      prompt: opts.prompt,
      system: opts.system,
      schema: opts.schema,
      schemaName: opts.schemaName,
      model: route.model,
      maxTokens: opts.maxTokens,
      temperature: opts.temperature,
      images: opts.images,
    };

    const start = Date.now();
    let result: AiGenerateResponse<T>;
    let status: 'success' | 'error' | 'fallback' = 'success';
    let usedProvider = route.provider.name;
    let usedModel = route.model;

    try {
      result = await this.attempt<T>(route.provider, baseRequest);
    } catch (firstErr) {
      this.logger.warn(
        `${route.provider.name} failed for task "${opts.task}" (attempt 1): ${firstErr.message}`,
      );
      try {
        // Same-provider retry once — covers transient timeouts/5xx/network blips.
        result = await this.attempt<T>(route.provider, baseRequest);
      } catch (secondErr) {
        if (!route.fallback || !route.fallbackModel) {
          await this.logFailure(opts, route.provider.name, route.model, start);
          throw new AiGenerationFailedError(opts.task, secondErr.message);
        }
        this.logger.warn(
          `${route.provider.name} failed twice for task "${opts.task}", ` +
            `falling back to ${route.fallback.name}: ${secondErr.message}`,
        );
        try {
          result = await this.attempt<T>(route.fallback, {
            ...baseRequest,
            model: route.fallbackModel,
          });
          status = 'fallback';
          usedProvider = route.fallback.name;
          usedModel = route.fallbackModel;
        } catch (fallbackErr) {
          await this.logFailure(
            opts,
            route.fallback.name,
            route.fallbackModel,
            start,
          );
          throw new AiGenerationFailedError(opts.task, fallbackErr.message);
        }
      }
    }

    const latencyMs = Date.now() - start;

    if (opts.schema) {
      try {
        this.safety.validateAgainstSchema(result.data, opts.schema);
      } catch (validationErr) {
        this.recordUsage({
          task: opts.task,
          userId: opts.userId,
          provider: usedProvider,
          model: usedModel,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          cacheReadTokens: result.usage.cacheReadTokens,
          latencyMs,
          status: 'error',
        });
        throw validationErr;
      }
    }

    this.recordUsage({
      task: opts.task,
      userId: opts.userId,
      provider: usedProvider,
      model: usedModel,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      cacheReadTokens: result.usage.cacheReadTokens,
      latencyMs,
      status,
    });

    if (opts.cacheKey) this.cache.set(opts.cacheKey, result);

    return result;
  }

  private attempt<T>(
    provider: AiProvider,
    request: AiGenerateRequest,
  ): Promise<AiGenerateResponse<T>> {
    return Promise.race([
      provider.generate<T>(request),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('AI request timed out')),
          this.requestTimeoutMs,
        ),
      ),
    ]);
  }

  private recordUsage(entry: UsageLogEntry): void {
    this.usageLog.record(entry).catch(() => {});
  }

  private async logFailure(
    opts: AiGenerateOptions,
    provider: string,
    model: string,
    start: number,
  ): Promise<void> {
    this.recordUsage({
      task: opts.task,
      userId: opts.userId,
      provider,
      model,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: Date.now() - start,
      status: 'error',
    });
  }
}
