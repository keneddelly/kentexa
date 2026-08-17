import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmbeddingProvider } from './interfaces/embedding-provider.interface';
import { OpenAiEmbeddingProvider } from './providers/openai-embedding.provider';

// Same taxonomy as AiRouter: which provider handles embeddings is an
// env-driven choice (EMBEDDING_PROVIDER), never a code change. Add a new
// provider by registering it below — EmbeddingService and everything that
// calls it never change.
@Injectable()
export class EmbeddingRouter {
  private readonly providers: Map<string, EmbeddingProvider>;

  constructor(
    private config: ConfigService,
    openai: OpenAiEmbeddingProvider,
  ) {
    this.providers = new Map<string, EmbeddingProvider>([[openai.name, openai]]);
  }

  resolve(): EmbeddingProvider {
    const desiredName = this.config.get<string>('EMBEDDING_PROVIDER') || 'openai';
    const desired = this.providers.get(desiredName);
    if (desired?.isConfigured) return desired;

    // Desired provider has no API key set — degrade to whichever provider
    // IS configured, same as AiRouter, rather than throwing.
    for (const provider of this.providers.values()) {
      if (provider.isConfigured) return provider;
    }
    throw new Error(
      'No embedding provider is configured — set OPENAI_API_KEY (or register and configure another EmbeddingProvider).',
    );
  }

  // Used by AiController's status endpoint — never exposes key material.
  listProviders(): { name: string; enabled: boolean; dimensions: number }[] {
    return Array.from(this.providers.values()).map((p) => ({
      name: p.name,
      enabled: p.isConfigured,
      dimensions: p.dimensions,
    }));
  }
}
