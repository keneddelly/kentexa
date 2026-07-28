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

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(
    private readonly notifService: InAppNotificationService,
    private readonly pushService: PushService,
  ) {}

  @Get('my')
  getMyNotifications(@Request() req, @Query('page') page?: string) {
    return this.notifService.getMyNotifications(
      req.user.id,
      page ? Number(page) : 1,
    );
  }

  @Get('unread-count')
  getUnreadCount(@Request() req) {
    return this.notifService
      .getUnreadCount(req.user.id)
      .then((count) => ({ count }));
  }

  @Patch('read-all')
  markAllRead(@Request() req) {
    return this.notifService.markAllReadById(req.user.id);
  }

  @Patch(':id/read')
  markOneRead(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.notifService.markRead(req.user.id, id);
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
  unsubscribe(@Body('endpoint') endpoint: string) {
    return this.pushService.unsubscribe(endpoint);
  }
}
