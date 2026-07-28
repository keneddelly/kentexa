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
  @UseGuards(JwtAuthGuard)
  @Get('admin/all')
  findAll() {
    return this.service.findAll();
  }

  // Admin: create
  @UseGuards(JwtAuthGuard)
  @Post('admin')
  create(@Request() req, @Body() dto: any) {
    return this.service.create(req.user, dto);
  }

  // Admin: update
  @UseGuards(JwtAuthGuard)
  @Patch('admin/:id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.service.update(id, dto);
  }

  // Admin: delete
  @UseGuards(JwtAuthGuard)
  @Delete('admin/:id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
