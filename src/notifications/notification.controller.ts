import { Controller, Get, Post, Delete, Patch, Param, Body, UseGuards, Request, ParseIntPipe, Query, NotFoundException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/auth.guard';
import { InAppNotificationService } from './in-app-notification.service';
import { PushService } from './push.service';
import { RoleContextGuard } from '../role-context/role-context.guard';
import { CurrentRoleContext } from '../role-context/current-role-context.decorator';
import type { RoleContext } from '../role-context/role-context.types';

@Controller('notifications')
@UseGuards(JwtAuthGuard, RoleContextGuard)
export class NotificationController {
  constructor(private readonly notifService: InAppNotificationService, private readonly pushService: PushService) {}

  @Get('my')
  getMyNotifications(@Request() req, @Query('page') page?: string, @CurrentRoleContext() roleContext?: RoleContext) {
    return this.notifService.getMyNotifications(req.user.id, page ? Number(page) : 1, 30, roleContext);
  }
  @Get('unread-count')
  getUnreadCount(@Request() req, @CurrentRoleContext() roleContext?: RoleContext) {
    return this.notifService.getUnreadCount(req.user.id, roleContext).then((count) => ({ count }));
  }
  @Get('device-status')
  getDeviceStatus(@Request() req) { return this.pushService.getDeviceStatus(req.user.id); }
  @Post('push/test')
  @Throttle({ default: { limit: 2, ttl: 60_000 } })
  sendTestPush(@Request() req) { return this.pushService.sendTestToUser(req.user.id); }
  @Get(':id')
  async getOne(@Request() req, @Param('id', ParseIntPipe) id: number, @CurrentRoleContext() roleContext: RoleContext) {
    const notification = await this.notifService.getNotificationById(req.user.id, id, roleContext);
    if (!notification) throw new NotFoundException();
    return notification;
  }
  @Patch('read-all')
  markAllRead(@Request() req, @CurrentRoleContext() roleContext?: RoleContext) {
    return this.notifService.markAllReadById(req.user.id, roleContext);
  }
  @Patch(':id/read')
  markOneRead(@Request() req, @Param('id', ParseIntPipe) id: number, @CurrentRoleContext() roleContext?: RoleContext) {
    return this.notifService.markRead(req.user.id, id, roleContext);
  }
  @Post('device-token')
  async registerDeviceToken(@Request() req, @Body() body: { token: string; platform?: string }) {
    await this.pushService.registerDeviceToken(req.user.id, body?.token, body?.platform === 'ios' ? 'ios' : 'android');
    return { ok: true };
  }
  @Post('device-token/remove')
  async removeDeviceToken(@Request() req, @Body() body: { token: string }) {
    await this.pushService.removeDeviceToken(req.user.id, body?.token);
    return { ok: true };
  }
  @Get('push/vapid-key')
  getVapidKey() { return { publicKey: this.pushService.getPublicKey() }; }
  @Get('push/status')
  async pushStatus(@Request() req, @Query('endpoint') endpoint: string) {
    return { subscribed: await this.pushService.hasSubscription(req.user.id, endpoint) };
  }
  @Post('push/subscribe')
  subscribe(@Request() req, @Body() body: any) { return this.pushService.subscribe(req.user.id, body); }
  @Delete('push/unsubscribe')
  unsubscribe(@Body('endpoint') endpoint: string, @Request() req) { return this.pushService.unsubscribe(endpoint, req.user.id); }
}
