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
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Public Meta webhook handshake and signature boundary.
 *
 * This controller intentionally does not acknowledge message deliveries yet:
 * durable event persistence and inbox routing must be implemented before
 * returning 200 to Meta, otherwise messages could be silently discarded.
 */
@Controller('business/instagram')
export class InstagramWebhookController {
  constructor(private readonly config: ConfigService) {}

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
  receiveWebhook(
    @Req() request: { rawBody?: Buffer },
    @Headers('x-hub-signature-256') signature?: string,
  ): never {
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

    // Do not return 200 until event persistence and idempotent inbox processing
    // are implemented. A 503 tells Meta this delivery was not accepted.
    throw new ServiceUnavailableException(
      'Instagram webhook signature verified, but event ingestion is not enabled yet.',
    );
  }

  private constantTimeEquals(left: string, right: string): boolean {
    const a = Buffer.from(left, 'utf8');
    const b = Buffer.from(right, 'utf8');
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
