import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenAiCompatibleClient } from './openai-compatible.base';
import {
  AiGenerateRequest,
  AiGenerateResponse,
  AiProvider,
} from '../interfaces/ai-provider.interface';

// Alibaba Cloud DashScope's OpenAI-compatible mode endpoint. Verify against
// https://www.alibabacloud.com/help/en/model-studio/ if Qwen requests start
// failing — Alibaba occasionally revises the compatible-mode base path.
const QWEN_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';

@Injectable()
export class QwenProvider implements AiProvider {
  readonly name = 'qwen';
  private readonly client: OpenAiCompatibleClient;

  constructor(config: ConfigService) {
    this.client = new OpenAiCompatibleClient({
      providerName: this.name,
      apiKey: config.get<string>('QWEN_API_KEY'),
      baseURL: config.get<string>('QWEN_BASE_URL') || QWEN_BASE_URL,
    });
  }

  get isConfigured(): boolean {
    return this.client.isConfigured;
  }

  generate<T = unknown>(req: AiGenerateRequest): Promise<AiGenerateResponse<T>> {
    return this.client.generate<T>(req);
  }
}
