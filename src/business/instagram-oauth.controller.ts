import { BadRequestException, Controller, Get, Param, ParseIntPipe, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { InstagramOAuthService } from './instagram-oauth.service';

@Controller('business/:businessId/instagram/oauth')
@UseGuards(JwtAuthGuard)
export class InstagramOAuthController {
  constructor(private readonly oauth: InstagramOAuthService) {}

  @Get('start')
  start(@Param('businessId', ParseIntPipe) businessId: number, @Request() req: any) {
    if (!Number.isSafeInteger(businessId) || businessId < 1) throw new BadRequestException('A valid businessId is required.');
    return this.oauth.createAuthorizationUrl(businessId, req.user.id);
  }
}
