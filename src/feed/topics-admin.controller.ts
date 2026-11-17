import { Body, Controller, Get, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { TopicsService } from './topics.service';

/** Admin: the topics ("Mada") list (Mfululizo #410 phase 3, owner approved 2026-11-17). */
@Controller('topics/admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class TopicsAdminController {
  constructor(private readonly topics: TopicsService) {}

  @Get()
  list() {
    return this.topics.adminList();
  }

  @Post()
  create(@Body() body: any, @Request() req: any) {
    return this.topics.adminCreate(req.user.id, body);
  }

  @Patch(':key')
  update(@Param('key') key: string, @Body() body: any, @Request() req: any) {
    return this.topics.adminUpdate(req.user.id, String(key || '').toLowerCase(), body);
  }
}
