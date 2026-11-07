import { Controller, Get, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { InstagramOAuthService } from './instagram-oauth.service';

@Controller('business/instagram')
export class InstagramOAuthCallbackController {
  constructor(
    private readonly oauth: InstagramOAuthService,
    private readonly config: ConfigService,
  ) {}

  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Res() response: Response,
  ): Promise<void> {
    // Never expose Meta's authorization code, state, or provider error details
    // in the browser URL. The one-time state is consumed by completeAuthorization.
    let businessId: number | null = null;
    let result = 'error';
    try {
      if (error) throw new Error('Instagram authorization was cancelled or denied.');
      const completed = await this.oauth.completeAuthorization(code, state);
      businessId = completed.businessId;
      result = completed.connected.length ? 'success' : 'error';
    } catch {
      // Callback failures must still return the user to Kentexa with a visible
      // error state; returning a backend JSON error strands the browser here.
      result = 'error';
    }

    const frontendUrl = this.config.get<string>('FRONTEND_URL') || 'https://kentexa.com';
    const target = new URL('/', frontendUrl);
    target.searchParams.set('instagramOAuth', result);
    if (businessId && Number.isSafeInteger(businessId)) {
      target.searchParams.set('businessId', String(businessId));
    }
    response.redirect(302, target.toString());
  }
}
