export interface AiGenerateRequest {
  prompt: string;
  system?: string;
  schema?: Record<string, any>;
  schemaName?: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
  // Plain HTTPS image URLs — Kentexa images are already hosted (uploaded
  // via /upload/images), so no base64 encoding is needed. Only providers
  // that support vision do anything with this; others should ignore it
  // rather than error (see each provider's generate()).
  images?: string[];
}

export interface AiGenerateResponse<T = unknown> {
  data: T;
  provider: string;
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
  };
}

// Every provider implements exactly this — callers of AiService never see a
// provider-specific request/response shape, so swapping providers or adding
// a new one never touches calling code.
export interface AiProvider {
  readonly name: string;
  readonly isConfigured: boolean;
  generate<T = unknown>(req: AiGenerateRequest): Promise<AiGenerateResponse<T>>;
}
