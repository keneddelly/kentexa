import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import { InstagramWebhookEvent } from './entities/instagram-webhook-event.entity';

@Injectable()
export class InstagramWebhookIngestionService {
  constructor(
    @InjectRepository(InstagramWebhookEvent)
    private readonly events: Repository<InstagramWebhookEvent>,
  ) {}

  /**
   * Persist the exact signed delivery before acknowledging Meta.
   * A hash of the raw body makes Meta retries of the same delivery idempotent.
   */
  async accept(rawBody: Buffer): Promise<{ duplicate: boolean }> {
    let payload: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(rawBody.toString('utf8'));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Expected a JSON object.');
      }
      payload = parsed as Record<string, unknown>;
    } catch {
      throw new BadRequestException('Instagram webhook body must be a valid JSON object.');
    }

    const eventHash = createHash('sha256').update(rawBody).digest('hex');
    const objectType = typeof payload.object === 'string' ? payload.object : null;

    const result = await this.events
      .createQueryBuilder()
      .insert()
      .values({
        eventHash,
        objectType,
        payload,
        processingStatus: 'received',
        processingAttempts: 0,
        processingError: null,
        processedAt: null,
      })
      .orIgnore()
      .execute();

    return { duplicate: result.identifiers.length === 0 };
  }
}
