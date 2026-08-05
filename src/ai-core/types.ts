export interface LlmGenerateRequest {
  system?: string;
  prompt: string;
  maxTokens?: number;
}

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface LlmResult {
  text: string;
  usage: LlmUsage;
  provider: string;
  model: string;
}

export interface ILlmProvider {
  readonly name: string;
  generate(request: LlmGenerateRequest): Promise<LlmResult>;
}
