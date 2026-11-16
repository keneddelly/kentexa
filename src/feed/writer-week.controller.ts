import { Body, Controller, Get, Param, ParseIntPipe, Post, Request, UseGuards } from '@nestjs/common';
import { WriterWeekService } from './writer-week.service';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

/** Mwandishi wa Wiki (owner approved 2026-11-16). Public reads; admins may remove a pick. */
@Controller('writer-of-week')
export class WriterWeekController {
  constructor(private readonly writers: WriterWeekService) {}

  /** The writer of the week and the next places (everyone, guests too). */
  @Get()
  current() {
    return this.writers.current();
  }

  /** How many times a person has been writer of the week (their profile). */
  @Get('profile/:userId')
  profile(@Param('userId', ParseIntPipe) userId: number) {
    return this.writers.wins(userId);
  }

  @Get('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  admin() {
    return this.writers.adminWeek();
  }

  @Post('admin/:id/remove')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  remove(@Param('id', ParseIntPipe) id: number, @Body() body: { reason?: string }, @Request() req: any) {
    return this.writers.remove(id, req.user.id, body?.reason);
  }
}
