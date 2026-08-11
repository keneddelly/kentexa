import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AnnouncementsService } from './announcements.service';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@Controller('announcements')
export class AnnouncementsController {
  constructor(private readonly service: AnnouncementsService) {}

  // User: get their announcements (unread)
  @UseGuards(JwtAuthGuard)
  @Get('my')
  getMyAnnouncements(@Request() req) {
    return this.service.getForUser(req.user);
  }

  // User: get unread count (for bell icon)
  @UseGuards(JwtAuthGuard)
  @Get('unread-count')
  getUnreadCount(@Request() req) {
    return this.service.getUnreadCount(req.user);
  }

  // User: mark as read
  @UseGuards(JwtAuthGuard)
  @Patch(':id/read')
  markRead(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.service.markRead(id, req.user.id);
  }

  // Admin: get all
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('admin/all')
  findAll() {
    return this.service.findAll();
  }

  // Admin: create — can trigger a real SMS blast (sendSms: true), so this
  // guard is the only thing standing between any signed-up user and a
  // platform-wide message send.
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('admin')
  create(@Request() req, @Body() dto: any) {
    return this.service.create(req.user, dto);
  }

  // Admin: update
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch('admin/:id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.service.update(id, dto);
  }

  // Admin: delete
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Delete('admin/:id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
