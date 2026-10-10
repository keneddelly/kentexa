import { Controller, Get, Param, ParseIntPipe, Post, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { DispatchRemindersService } from './dispatch-reminders.service';

@Controller('dispatch-reminders')
export class DispatchRemindersController {
  constructor(private readonly svc: DispatchRemindersService) {}

  // The red number and its list, for the logged-in Super Agent's own office.
  @Get('mine')
  @UseGuards(JwtAuthGuard)
  mine(@Request() req) {
    return this.svc.mine(req.user.id);
  }

  // "Still here": one tap, no form.
  @Post('parcels/:parcelId/still-here')
  @UseGuards(JwtAuthGuard)
  stillHere(@Request() req, @Param('parcelId', ParseIntPipe) parcelId: number) {
    return this.svc.markStillHere(req.user.id, parcelId);
  }

  // Admins see every "Still here" mark and every evening SMS attempt.
  @Get('admin/still-here')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.CUSTOMER_CARE)
  adminStillHere(@Query('days') days?: string) {
    return this.svc.adminStillHereMarks(Number(days) || 7);
  }

  @Get('admin/reminders')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.CUSTOMER_CARE)
  adminReminders(@Query('days') days?: string) {
    return this.svc.adminReminders(Number(days) || 7);
  }
}
