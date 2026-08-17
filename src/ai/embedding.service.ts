import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

// A separate capability from AiService/AiRouter — embeddings aren't a
// "generate a response" task, they're a fixed numeric representation of
// text, and only OpenAI (of the four configured providers) exposes an
// embeddings endpoint at all. Talks to OpenAI directly rather than routing
// through AiRouter's model-tier system, which doesn't apply here.
@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly client: OpenAI | null;
  private static readonly MODEL = 'text-embedding-3-small'; // 1536 dims

  constructor(config: ConfigService) {
    const apiKey = config.get<string>('OPENAI_API_KEY');
    this.client = apiKey ? new OpenAI({ apiKey }) : null;
  }

  get isConfigured(): boolean {
    return this.client !== null;
  }

  // Fails open — returns null on any error or missing key, same discipline
  // as every other AI feature in this app (AiSearchParserService,
  // AiSearchExplainerService). Callers must treat null as "skip silently."
  async embed(text: string): Promise<number[] | null> {
    if (!this.client || !text?.trim()) return null;
    try {
      const res = await this.client.embeddings.create({
        model: EmbeddingService.MODEL,
        input: text.trim().slice(0, 8000),
      });
      return res.data[0]?.embedding ?? null;
    } catch (err) {
      this.logger.warn(`Embedding request failed: ${err.message}`);
      return null;
    }
  }
}
