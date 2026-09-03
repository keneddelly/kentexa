/**
 * notification.controller.ts
 * Place at: src/notifications/notification.controller.ts
 */
import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Param,
  Body,
  UseGuards,
  Request,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { InAppNotificationService } from './in-app-notification.service';
import { PushService } from './push.service';
import { RoleContextGuard } from '../role-context/role-context.guard';
import { CurrentRoleContext } from '../role-context/current-role-context.decorator';
import type { RoleContext } from '../role-context/role-context.types';

// Stage 2B item 4/5: RoleContextGuard resolves the caller's current active
// context on every route in this controller (never denies on its own --
// every authenticated user always has at least an active buyer session,
// see RoleContextGuard's own doc comment) so getMyNotifications/
// getUnreadCount/markAllRead/markOneRead can apply the current permitted
// audience. Each service method treats roleContext as optional and only
// scopes when SCOPED_NOTIFICATION_READ is on, so this is safe to apply
// controller-wide without a parallel unscoped path to maintain.
@Controller('notifications')
@UseGuards(JwtAuthGuard, RoleContextGuard)
export class NotificationController {
  constructor(
    private readonly notifService: InAppNotificationService,
    private readonly pushService: PushService,
  ) {}

  @Get('my')
  getMyNotifications(
    @Request() req,
    @Query('page') page?: string,
    @CurrentRoleContext() roleContext?: RoleContext,
  ) {
    return this.notifService.getMyNotifications(
      req.user.id,
      page ? Number(page) : 1,
      30,
      roleContext,
    );
  }

  @Get('unread-count')
  getUnreadCount(@Request() req, @CurrentRoleContext() roleContext?: RoleContext) {
    return this.notifService
      .getUnreadCount(req.user.id, roleContext)
      .then((count) => ({ count }));
  }

  // Stage 2B item 5 (mandatory): previously unconditionally user-wide --
  // marking all read while Seller-active would also mark Buyer/Transport/
  // Agent/SuperAgent/other-workspace operational notifications read. Now
  // scoped to ACCOUNT + the current active role/workspace/transaction.
  @Patch('read-all')
  markAllRead(@Request() req, @CurrentRoleContext() roleContext?: RoleContext) {
    return this.notifService.markAllReadById(req.user.id, roleContext);
  }

  @Patch(':id/read')
  markOneRead(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @CurrentRoleContext() roleContext?: RoleContext,
  ) {
    return this.notifService.markRead(req.user.id, id, roleContext);
  }

  // ── Push subscription ─────────────────────────────────────────────────────
  @Get('push/vapid-key')
  getVapidKey() {
    return { publicKey: this.pushService.getPublicKey() };
  }

  @Post('push/subscribe')
  subscribe(@Request() req, @Body() body: any) {
    return this.pushService.subscribe(req.user.id, body);
  }

  @Delete('push/unsubscribe')
  unsubscribe(@Body('endpoint') endpoint: string, @Request() req) {
    return this.pushService.unsubscribe(endpoint, req.user.id);
  }
}
