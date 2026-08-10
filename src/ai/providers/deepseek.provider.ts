import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenAiCompatibleClient } from './openai-compatible.base';
import {
  AiGenerateRequest,
  AiGenerateResponse,
  AiProvider,
} from '../interfaces/ai-provider.interface';

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';

@Injectable()
export class DeepSeekProvider implements AiProvider {
  readonly name = 'deepseek';
  private readonly client: OpenAiCompatibleClient;

  constructor(config: ConfigService) {
    this.client = new OpenAiCompatibleClient({
      providerName: this.name,
      apiKey: config.get<string>('DEEPSEEK_API_KEY'),
      baseURL: config.get<string>('DEEPSEEK_BASE_URL') || DEEPSEEK_BASE_URL,
    });
  }

  get isConfigured(): boolean {
    return this.client.isConfigured;
  }

  generate<T = unknown>(req: AiGenerateRequest): Promise<AiGenerateResponse<T>> {
    return this.client.generate<T>(req);
  }
}
