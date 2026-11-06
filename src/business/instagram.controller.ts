import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { InstagramService } from './instagram.service';

@Controller('business/instagram')
export class InstagramController {
  constructor(private readonly instagram: InstagramService) {}

  @UseGuards(JwtAuthGuard)
  @Get('connect')
  connect(@Request() req: any) {
    return this.instagram.createAuthorizationUrl(Number(req.user.id));
  }

  // Meta redirects here. OAuth state is signed and short-lived; the callback
  // deliberately does not rely on a browser session or Kentexa JWT cookie.
  @Get('callback')
  callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error?: string,
    @Query('error_description') errorDescription?: string,
  ) {
    if (error) {
      throw new BadRequestException(errorDescription || 'Instagram authorization was cancelled.');
    }
    return this.instagram.completeAuthorization(code, state);
  }

  @UseGuards(JwtAuthGuard)
  @Get('connections')
  connections(@Request() req: any) {
    return this.instagram.getConnections(Number(req.user.id));
  }

  @UseGuards(JwtAuthGuard)
  @Post('disconnect')
  disconnect(@Request() req: any, @Query('instagramUserId') instagramUserId?: string) {
    return this.instagram.disconnect(Number(req.user.id), instagramUserId);
  }
}
