import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import {
  EmbeddingProvider,
  EmbeddingRequest,
  EmbeddingResponse,
} from '../interfaces/embedding-provider.interface';

@Injectable()
export class OpenAiEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'openai';
  readonly defaultModel = 'text-embedding-3-small';
  readonly dimensions = 1536;
  private readonly client: OpenAI | null;

  constructor(config: ConfigService) {
    const apiKey = config.get<string>('OPENAI_API_KEY');
    this.client = apiKey ? new OpenAI({ apiKey }) : null;
  }

  get isConfigured(): boolean {
    return this.client !== null;
  }

  async embed(req: EmbeddingRequest): Promise<EmbeddingResponse> {
    if (!this.client) {
      throw new Error('OpenAI embedding provider is not configured (no API key).');
    }
    const model = req.model || this.defaultModel;
    const res = await this.client.embeddings.create({
      model,
      input: req.text.slice(0, 8000),
    });
    const embedding = res.data[0]?.embedding;
    if (!embedding) throw new Error('OpenAI returned no embedding.');
    return { embedding, dimensions: embedding.length, model };
  }
}
