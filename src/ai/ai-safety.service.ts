import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export class AiRefusalError extends Error {
  constructor(
    public readonly category: string | null,
    message = 'The AI declined to process this request.',
  ) {
    super(message);
    this.name = 'AiRefusalError';
  }

  toUserMessage(): string {
    return 'This request could not be processed by the AI assistant. Please try rephrasing it.';
  }
}

@Injectable()
export class AiSafetyService {
  private readonly maxInputChars: number;

  constructor(private config: ConfigService) {
    this.maxInputChars = Number(
      this.config.get<string>('AI_MAX_INPUT_CHARS') || 4000,
    );
  }

  assertInputLength(text: string): void {
    if (text.length > this.maxInputChars) {
      throw new BadRequestException(
        `Input is too long for the AI assistant (max ${this.maxInputChars} characters).`,
      );
    }
  }

  // Lightweight shape check — confirms every top-level key the schema
  // requires is present on the parsed response. Full JSON-schema validation
  // is already enforced server-side by output_config.format; this is a
  // last-line guard against a malformed/empty parse.
  validateAgainstSchema(data: unknown, schema: Record<string, any>): void {
    if (!data || typeof data !== 'object') {
      throw new BadRequestException('AI response was empty or malformed.');
    }
    const required: string[] = schema.required || [];
    for (const key of required) {
      if (!(key in (data as Record<string, unknown>))) {
        throw new BadRequestException(
          `AI response is missing expected field "${key}".`,
        );
      }
    }
  }
}
