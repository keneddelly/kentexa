import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiProvider } from './interfaces/ai-provider.interface';
import { AnthropicProvider } from './providers/anthropic.provider';
import { OpenAiProvider } from './providers/openai.provider';
import { DeepSeekProvider } from './providers/deepseek.provider';
import { QwenProvider } from './providers/qwen.provider';

export type AiTask =
  | 'moderation'
  | 'summary'
  | 'reply-draft'
  | 'product-listing'
  | 'search-parse'
  | 'search-explain'
  | 'seller-profile-enrich';

export type AiTier = 'simple' | 'reasoning' | 'coding';

// Taxonomy decision, not a runtime toggle — which bucket a task falls into
// rarely changes. What DOES change at runtime (via env, no redeploy of this
// map) is which provider/model handles each tier.
const TASK_TIER: Record<AiTask, AiTier> = {
  moderation: 'simple',
  summary: 'simple',
  'reply-draft': 'simple',
  'product-listing': 'simple',
  'search-parse': 'simple',
  'search-explain': 'simple',
  'seller-profile-enrich': 'simple',
  // 'reasoning' and 'coding' tiers are wired and ready for future tasks
  // (e.g. a chat assistant, code-generation tooling) that don't exist yet.
};

const TIER_DEFAULT_PROVIDER: Record<AiTier, string> = {
  simple: 'deepseek',
  reasoning: 'openai',
  coding: 'anthropic',
};

const PROVIDER_DEFAULT_MODEL: Record<string, string> = {
  anthropic: 'claude-opus-5',
  openai: 'gpt-4o',
  deepseek: 'deepseek-chat',
  qwen: 'qwen-plus',
};

export interface ResolvedRoute {
  task: AiTask;
  tier: AiTier;
  provider: AiProvider;
  model: string;
  fallback: AiProvider | null;
  fallbackModel: string | null;
}

// Decides which provider/model handles a request. Nothing here is
// hardcoded except the task→tier taxonomy — provider selection is entirely
// env-driven (AI_<TIER>_PROVIDER / AI_<TIER>_MODEL / AI_<TIER>_FALLBACK_PROVIDER)
// so swapping providers is a config change, never a code change.
@Injectable()
export class AiRouter {
  private readonly providers: Map<string, AiProvider>;

  constructor(
    private config: ConfigService,
    anthropic: AnthropicProvider,
    openai: OpenAiProvider,
    deepseek: DeepSeekProvider,
    qwen: QwenProvider,
  ) {
    this.providers = new Map<string, AiProvider>(
      [anthropic, openai, deepseek, qwen].map((p) => [p.name, p]),
    );
  }

  resolve(task: AiTask): ResolvedRoute {
    const tier = TASK_TIER[task] ?? 'simple';
    const tierUpper = tier.toUpperCase();

    const desiredProviderName =
      this.config.get<string>(`AI_${tierUpper}_PROVIDER`) ||
      TIER_DEFAULT_PROVIDER[tier];

    let provider = this.getConfiguredProvider(desiredProviderName);
    let model: string;

    if (provider) {
      model =
        this.config.get<string>(`AI_${tierUpper}_MODEL`) ||
        PROVIDER_DEFAULT_MODEL[provider.name];
    } else {
      // Desired provider has no API key set — degrade to whichever
      // provider IS configured (e.g. only ANTHROPIC_API_KEY set today)
      // rather than throwing, so nothing breaks until other keys are added.
      provider = this.firstConfiguredProvider();
      if (!provider) {
        throw new Error(
          'No AI provider is configured — set at least one of ' +
            'OPENAI_API_KEY, ANTHROPIC_API_KEY, DEEPSEEK_API_KEY, QWEN_API_KEY.',
        );
      }
      model = PROVIDER_DEFAULT_MODEL[provider.name];
    }

    const fallbackName = this.config.get<string>(
      `AI_${tierUpper}_FALLBACK_PROVIDER`,
    );
    const fallback = fallbackName
      ? this.getConfiguredProvider(fallbackName)
      : this.firstConfiguredProvider(provider.name);

    return {
      task,
      tier,
      provider,
      model,
      fallback: fallback ?? null,
      // The fallback provider almost certainly doesn't understand the
      // primary's model string, so it gets its own default, not a reused one.
      fallbackModel: fallback ? PROVIDER_DEFAULT_MODEL[fallback.name] : null,
    };
  }

  // Used by AiController's status endpoint — never exposes key material,
  // only which providers are registered and whether a key is present.
  listProviders(): { name: string; enabled: boolean }[] {
    return Array.from(this.providers.values()).map((p) => ({
      name: p.name,
      enabled: p.isConfigured,
    }));
  }

  private getConfiguredProvider(name: string): AiProvider | undefined {
    const provider = this.providers.get(name);
    return provider?.isConfigured ? provider : undefined;
  }

  private firstConfiguredProvider(exclude?: string): AiProvider | undefined {
    for (const provider of this.providers.values()) {
      if (provider.isConfigured && provider.name !== exclude) return provider;
    }
    return undefined;
  }
}
