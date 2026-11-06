import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { InstagramOAuthService } from './instagram-oauth.service';

@Controller('business/:businessId/instagram/oauth')
@UseGuards(JwtAuthGuard)
export class InstagramOAuthController {
  constructor(private readonly oauth: InstagramOAuthService) {}

  @Get('start')
  start(@Query('businessId') businessId: string, @Request() req: any) {
    const id = Number(businessId);
    if (!Number.isSafeInteger(id) || id < 1) throw new Error('A valid businessId query parameter is required.');
    return this.oauth.createAuthorizationUrl(id, req.user.id);
  }
}
