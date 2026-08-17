// Mirrors AiProvider (ai-provider.interface.ts) — same reason: nothing
// downstream of EmbeddingService should know or care which vendor actually
// computes the vector. Swapping providers (e.g. if OpenAI becomes
// expensive) means adding a new class here and a one-line env change,
// never touching SearchIndexService or any reindex hook.
export interface EmbeddingRequest {
  text: string;
  model?: string;
}

export interface EmbeddingResponse {
  embedding: number[];
  dimensions: number;
  model: string;
}

export interface EmbeddingProvider {
  readonly name: string;
  readonly isConfigured: boolean;
  readonly defaultModel: string;
  // The vector dimension this provider's default model produces. The
  // search_embeddings table's column is dimension-typed (vector(1536));
  // switching to a provider with a different dimension requires re-running
  // the existing embeddings backfill (POST /search/admin/backfill-embeddings)
  // once — a normal one-time data migration, not a code rebuild.
  readonly dimensions: number;
  embed(req: EmbeddingRequest): Promise<EmbeddingResponse>;
}
