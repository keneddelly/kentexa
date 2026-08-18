import OpenAI from 'openai';
import {
  AiGenerateRequest,
  AiGenerateResponse,
} from '../interfaces/ai-provider.interface';

export interface OpenAiCompatibleConfig {
  providerName: string;
  apiKey: string | undefined;
  baseURL?: string;
}

// Shared request/parse logic for every provider that speaks the OpenAI
// Chat Completions wire format (OpenAI itself, DeepSeek, Qwen/DashScope
// compatible-mode, and any future provider with an OpenAI-compatible API).
// Each provider file below is a thin wrapper around this — same interface,
// different baseURL/apiKey, without tripling the request/parse code.
export class OpenAiCompatibleClient {
  private readonly client: OpenAI | null;

  constructor(private readonly cfg: OpenAiCompatibleConfig) {
    this.client = cfg.apiKey
      ? new OpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseURL })
      : null;
  }

  get isConfigured(): boolean {
    return this.client !== null;
  }

  async generate<T = unknown>(
    req: AiGenerateRequest,
  ): Promise<AiGenerateResponse<T>> {
    if (!this.client) {
      throw new Error(
        `${this.cfg.providerName} provider is not configured (no API key).`,
      );
    }

    const systemParts: string[] = [];
    if (req.system) systemParts.push(req.system);
    if (req.schema) {
      systemParts.push(
        'Respond with ONLY a single valid JSON object matching this JSON ' +
          `schema — no prose, no markdown fences: ${JSON.stringify(req.schema)}`,
      );
    }

    const completion = await this.client.chat.completions.create({
      model: req.model,
      max_tokens: req.maxTokens ?? 1024,
      ...(req.temperature !== undefined
        ? { temperature: req.temperature }
        : {}),
      ...(req.schema ? { response_format: { type: 'json_object' } } : {}),
      messages: [
        ...(systemParts.length
          ? [{ role: 'system' as const, content: systemParts.join('\n\n') }]
          : []),
        {
          role: 'user' as const,
          content: req.images?.length
            ? [
                ...req.images.map((url) => ({
                  type: 'image_url' as const,
                  image_url: { url },
                })),
                { type: 'text' as const, text: req.prompt },
              ]
            : req.prompt,
        },
      ],
    });

    const text = completion.choices[0]?.message?.content ?? '';

    let data: T;
    if (req.schema) {
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`${this.cfg.providerName} response was not valid JSON.`);
      }
    } else {
      data = text as unknown as T;
    }

    const usage = completion.usage;
    return {
      data,
      provider: this.cfg.providerName,
      model: req.model,
      usage: {
        inputTokens: usage?.prompt_tokens ?? 0,
        outputTokens: usage?.completion_tokens ?? 0,
      },
    };
  }
}
