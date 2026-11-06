import {
  Controller,
  Get,
  Post,
  Query,
  Req,
  Headers,
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { InstagramWebhookIngestionService } from './instagram-webhook-ingestion.service';

/**
 * Public Meta webhook handshake and signature boundary.
 * A delivery is acknowledged only after it has been durably recorded and
 * synchronous inbox processing has completed successfully. Failed processing
 * returns a retryable response to Meta.
 */
@Controller('business/instagram')
export class InstagramWebhookController {
  constructor(
    private readonly config: ConfigService,
    private readonly ingestion: InstagramWebhookIngestionService,
  ) {}

  @Get('webhook')
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') verifyToken: string,
    @Query('hub.challenge') challenge: string,
  ): string {
    const expected = this.config.get<string>('META_INSTAGRAM_WEBHOOK_VERIFY_TOKEN');

    if (!expected) {
      throw new ServiceUnavailableException(
        'Instagram webhook verification is not configured.',
      );
    }

    if (mode !== 'subscribe' || !verifyToken || !challenge) {
      throw new BadRequestException('Invalid Instagram webhook verification request.');
    }

    if (!this.constantTimeEquals(verifyToken, expected)) {
      throw new ForbiddenException('Instagram webhook verification token is invalid.');
    }

    return challenge;
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async receiveWebhook(
    @Req() request: { rawBody?: Buffer },
    @Headers('x-hub-signature-256') signature?: string,
  ): Promise<{ received: true; duplicate: boolean }> {
    const appSecret = this.config.get<string>('META_APP_SECRET');
    if (!appSecret) {
      throw new ServiceUnavailableException('Meta webhook signing is not configured.');
    }

    const rawBody = request.rawBody;
    if (!rawBody || !Buffer.isBuffer(rawBody)) {
      throw new ServiceUnavailableException(
        'Raw request body is unavailable; signed webhook verification cannot proceed.',
      );
    }

    if (!signature || !/^sha256=[a-f0-9]{64}$/i.test(signature)) {
      throw new ForbiddenException('Missing or malformed Meta webhook signature.');
    }

    const expected = `sha256=${createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
    if (!this.constantTimeEquals(signature.toLowerCase(), expected.toLowerCase())) {
      throw new ForbiddenException('Meta webhook signature is invalid.');
    }

    const result = await this.ingestion.accept(rawBody);
    return { received: true, duplicate: result.duplicate };
  }

  private constantTimeEquals(left: string, right: string): boolean {
    const a = Buffer.from(left, 'utf8');
    const b = Buffer.from(right, 'utf8');
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
