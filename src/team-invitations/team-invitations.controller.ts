import { Controller, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { TeamInvitationsService } from './team-invitations.service';

/** The invited person's side (owner approved 2026-11-03). The owner's side lives on /profiles/:id/members. */
@Controller('team-invitations')
export class TeamInvitationsController {
  constructor(private readonly invitations: TeamInvitationsService) {}

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  mine(@Request() req) {
    return this.invitations.mine(req.user);
  }

  /** The businesses I work for: Kazi shows "POS ya X" from this. */
  @Get('workplaces')
  @UseGuards(JwtAuthGuard)
  workplaces(@Request() req) {
    return this.invitations.workplaces(req.user.id);
  }

  /** Public: what the link shows before signing in (masked number only). */
  @Get(':token')
  preview(@Param('token') token: string) {
    return this.invitations.preview(token);
  }

  @Post(':token/accept')
  @UseGuards(JwtAuthGuard)
  accept(@Request() req, @Param('token') token: string) {
    return this.invitations.respond(token, req.user, true);
  }

  @Post(':token/decline')
  @UseGuards(JwtAuthGuard)
  decline(@Request() req, @Param('token') token: string) {
    return this.invitations.respond(token, req.user, false);
  }
}
