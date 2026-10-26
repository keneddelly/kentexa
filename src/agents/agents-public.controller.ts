import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { AgentsService } from './agents.service';

/**
 * Public agent facts for anyone viewing an agent's profile (CommerceProfile "Kazi" tab),
 * the same as offices, transporters, sellers and service providers already have. Kept out
 * of AgentsController, which requires a login for every route.
 */
@Controller('agents')
export class AgentsPublicController {
  constructor(private service: AgentsService) {}

  @Get('public/:userId')
  getPublicProfile(@Param('userId', ParseIntPipe) userId: number) {
    return this.service.findPublicByUserId(userId);
  }
}
