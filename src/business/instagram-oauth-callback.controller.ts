import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { InstagramOAuthService } from './instagram-oauth.service';

@Controller('business/instagram')
export class InstagramOAuthCallbackController {
  constructor(private readonly oauth: InstagramOAuthService) {}

  @Get('callback')
  callback(@Query('code') code: string, @Query('state') state: string, @Query('error') error?: string) {
    if (error) throw new BadRequestException('Instagram authorization was cancelled or denied.');
    return this.oauth.completeAuthorization(code, state);
  }
}
