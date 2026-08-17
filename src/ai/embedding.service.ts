import { Injectable, Logger } from '@nestjs/common';
import { EmbeddingRouter } from './embedding.router';

// The ONLY entry point the rest of Kentexa calls for embeddings — same role
// AiService plays for generate() tasks. Nothing downstream (SearchIndexService,
// every reindex hook in products/classifieds/services/commerce-profiles)
// knows or should know which vendor actually computes the vector; that's
// entirely EmbeddingRouter's decision, driven by the EMBEDDING_PROVIDER env
// var. Swapping providers later (e.g. if OpenAI becomes too expensive) means
// adding a new EmbeddingProvider + a config change here — this method's
// signature, and every caller of it, never change.
@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);

  constructor(private readonly router: EmbeddingRouter) {}

  get isConfigured(): boolean {
    try {
      this.router.resolve();
      return true;
    } catch {
      return false;
    }
  }

  // Fails open — returns null on any error or missing key, same discipline
  // as every other AI feature in this app (AiSearchParserService,
  // AiSearchExplainerService). Callers must treat null as "skip silently."
  async embed(text: string): Promise<number[] | null> {
    if (!text?.trim()) return null;
    try {
      const provider = this.router.resolve();
      const res = await provider.embed({ text: text.trim() });
      return res.embedding;
    } catch (err) {
      this.logger.warn(`Embedding request failed: ${err.message}`);
      return null;
    }
  }
}
