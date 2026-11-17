import { Body, Controller, Get, Header, HttpCode, Param, ParseIntPipe, Post, Query, Request, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { WriterOutreachService } from './writer-outreach.service';
import { unsubscribePage } from './writer-outreach-rules';
import { BACKEND_URL } from '../config/urls.config';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

/** Writers programme step B (#417): invitations (admin only), unsubscribe, join tracking, Founding Contributor. */
@Controller('writer-outreach')
export class WriterOutreachController {
  constructor(private readonly outreach: WriterOutreachService) {}

  // ── Admin ──
  @Get('admin/summary') @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.ADMIN)
  summary() { return this.outreach.summary(); }

  @Get('admin') @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.ADMIN)
  list(@Query('status') status?: string) { return this.outreach.list(status); }

  @Post('admin') @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.ADMIN)
  add(@Body() body: any, @Request() req: any) { return this.outreach.add(req.user.id, body); }

  @Post('admin/:id/review') @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.ADMIN)
  review(@Param('id', ParseIntPipe) id: number, @Body() body: { decision?: string }, @Request() req: any) {
    return this.outreach.review(req.user.id, id, String(body?.decision || ''));
  }

  @Get('admin/:id/preview') @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.ADMIN)
  preview(@Param('id', ParseIntPipe) id: number) { return this.outreach.preview(id); }

  @Post('admin/send') @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.ADMIN)
  send(@Body() body: { ids?: unknown }, @Request() req: any) { return this.outreach.send(req.user.id, body?.ids); }

  @Get('admin/founding') @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.ADMIN)
  foundingList() { return this.outreach.foundingList(); }

  @Post('admin/founding') @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.ADMIN)
  foundingAssign(@Body() body: any, @Request() req: any) { return this.outreach.foundingAssign(req.user.id, body); }

  @Post('admin/founding/:userId/remove') @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.ADMIN)
  foundingRemove(@Param('userId', ParseIntPipe) userId: number, @Request() req: any) { return this.outreach.foundingRemove(req.user.id, userId); }

  // ── Public ──
  /** The link in the email: a page with a button (link scanners never unsubscribe anyone). */
  @Get('unsubscribe') @Header('Content-Type', 'text/html; charset=utf-8') @Header('Cache-Control', 'no-store')
  unsubscribeAsk(@Query('t') t?: string) {
    return unsubscribePage('ask', `${BACKEND_URL.replace(/\/$/, '')}/writer-outreach/unsubscribe?t=${encodeURIComponent(String(t || '').slice(0, 40))}`);
  }

  /** The button, and mail apps' one-click unsubscribe (List-Unsubscribe-Post). */
  @Post('unsubscribe') @HttpCode(200) @Throttle({ default: { limit: 20, ttl: 60000 } }) @Header('Content-Type', 'text/html; charset=utf-8')
  async unsubscribe(@Query('t') t?: string) {
    await this.outreach.unsubscribe(t);
    return unsubscribePage('done', '');
  }

  @Post('claim') @UseGuards(JwtAuthGuard) @Throttle({ default: { limit: 10, ttl: 60000 } })
  claim(@Body() body: { token?: string }, @Request() req: any) { return this.outreach.claim(req.user.id, body?.token); }

  /** "Mchangiaji Mwanzilishi" on a profile (everyone, guests too). */
  @Get('founding/:userId')
  founding(@Param('userId', ParseIntPipe) userId: number) { return this.outreach.founding(userId); }
}
