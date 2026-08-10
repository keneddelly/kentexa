import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenAiCompatibleClient } from './openai-compatible.base';
import {
  AiGenerateRequest,
  AiGenerateResponse,
  AiProvider,
} from '../interfaces/ai-provider.interface';

@Injectable()
export class OpenAiProvider implements AiProvider {
  readonly name = 'openai';
  private readonly client: OpenAiCompatibleClient;

  constructor(config: ConfigService) {
    this.client = new OpenAiCompatibleClient({
      providerName: this.name,
      apiKey: config.get<string>('OPENAI_API_KEY'),
    });
  }

  get isConfigured(): boolean {
    return this.client.isConfigured;
  }

  generate<T = unknown>(req: AiGenerateRequest): Promise<AiGenerateResponse<T>> {
    return this.client.generate<T>(req);
  }
}
