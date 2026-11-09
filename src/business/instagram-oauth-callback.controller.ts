import { Controller, Get, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { InstagramConnectError, InstagramOAuthService } from './instagram-oauth.service';

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
    let businessId: number | null = await this.oauth.businessIdForCallbackState(state);
    let result = 'error';
    // Why it failed, as a plain code the page turns into Swahili (owner 2026-11-09: failures were
    // all one vague message). Never Meta's details.
    let reason = '';
    try {
      if (error) { reason = 'cancelled'; throw new Error('Instagram authorization was cancelled or denied.'); }
      const completed = await this.oauth.completeAuthorization(code, state);
      businessId = completed.businessId;
      result = completed.connected.length ? 'success' : 'error';
      if (completed.connected.length && completed.connected.some((c) => !c.webhookSubscribed)) reason = 'webhook';
    } catch (e) {
      // Callback failures must still return the user to Kentexa with a visible
      // error state; returning a backend JSON error strands the browser here.
      result = 'error';
      if (!reason) reason = e instanceof InstagramConnectError ? e.reason : 'meta';
    }

    const frontendUrl = this.config.get<string>('FRONTEND_URL') || 'https://kentexa.com';
    const target = new URL('/', frontendUrl);
    target.searchParams.set('instagramOAuth', result);
    if (reason) target.searchParams.set('instagramReason', reason);
    if (businessId && Number.isSafeInteger(businessId)) {
      target.searchParams.set('businessId', String(businessId));
    }
    response.redirect(302, target.toString());
  }
}
