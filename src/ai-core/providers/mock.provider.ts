import { Injectable } from '@nestjs/common';
import { ILlmProvider, LlmGenerateRequest, LlmResult } from '../types';

// ─────────────────────────────────────────────────────────────────────────
// Used automatically whenever ANTHROPIC_API_KEY is not set, so the app
// boots and every AI-backed feature still returns something sensible in
// dev. Deterministic — no randomness, no network call.
// ─────────────────────────────────────────────────────────────────────────
@Injectable()
export class MockLlmProvider implements ILlmProvider {
  readonly name = 'mock';

  generate(request: LlmGenerateRequest): Promise<LlmResult> {
    const preview = request.prompt.slice(0, 120).replace(/\s+/g, ' ').trim();
    return Promise.resolve({
      text: `[mock AI response — set ANTHROPIC_API_KEY for real output] ${preview}`,
      usage: { inputTokens: 0, outputTokens: 0 },
      provider: this.name,
      model: 'mock',
    });
  }
}
