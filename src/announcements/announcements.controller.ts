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
import { KentexaMessagesService, MessageDraft } from './kentexa-messages.service';
import { CurrentRoleContext } from '../role-context/current-role-context.decorator';
import type { RoleContext } from '../role-context/role-context.types';

@Controller('announcements')
export class AnnouncementsController {
  constructor(
    private readonly service: AnnouncementsService,
    private readonly messages: KentexaMessagesService,
  ) {}

  // ── "Tuma taarifa" (owner 2026-11-09) ─────────────────────────────────────
  // Open to admin, manager and customer care (the Roles hierarchy); the service decides what each
  // may send: customer care one person only; a manager's message to more than 100 people or with
  // SMS waits for admin. Finance and moderator cannot send.
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CUSTOMER_CARE)
  @Get('messages')
  listMessages() {
    return this.messages.list();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CUSTOMER_CARE)
  @Post('messages/preview')
  previewMessage(@Body() dto: MessageDraft, @CurrentRoleContext() role: RoleContext) {
    return this.messages.preview(dto, String(role?.roleType));
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CUSTOMER_CARE)
  @Post('messages/test')
  testMessage(@Request() req, @Body() dto: MessageDraft, @CurrentRoleContext() role: RoleContext) {
    return this.messages.test(req.user, String(role?.roleType), dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CUSTOMER_CARE)
  @Post('messages')
  createMessage(@Request() req, @Body() dto: MessageDraft, @CurrentRoleContext() role: RoleContext) {
    return this.messages.create(req.user, String(role?.roleType), dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CUSTOMER_CARE)
  @Post('messages/:id/approve')
  approveMessage(@Param('id', ParseIntPipe) id: number, @Request() req, @CurrentRoleContext() role: RoleContext) {
    return this.messages.approve(id, req.user, String(role?.roleType));
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CUSTOMER_CARE)
  @Post('messages/:id/reject')
  rejectMessage(@Param('id', ParseIntPipe) id: number, @Request() req, @Body() body: { reason?: string }, @CurrentRoleContext() role: RoleContext) {
    return this.messages.reject(id, req.user, String(role?.roleType), body?.reason);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CUSTOMER_CARE)
  @Post('messages/:id/cancel')
  cancelMessage(@Param('id', ParseIntPipe) id: number, @Request() req, @CurrentRoleContext() role: RoleContext) {
    return this.messages.cancel(id, req.user, String(role?.roleType));
  }

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

  // The old direct create (any SMS, no approval) is replaced by POST messages above.

  // Admin: update
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch('admin/:id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    // Only show / hide and wording; sending goes through the messages flow.
    const { title, message, isActive, priority, expiresAt } = dto || {};
    const clean = Object.fromEntries(Object.entries({ title, message, isActive, priority, expiresAt }).filter(([, v]) => v !== undefined));
    return this.service.update(id, clean);
  }

  // Admin: delete
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Delete('admin/:id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
