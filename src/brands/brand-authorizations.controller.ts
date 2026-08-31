import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { BrandAuthorizationsService } from './brand-authorizations.service';

@UseGuards(JwtAuthGuard)
@Controller('brand-authorizations')
export class BrandAuthorizationsController {
  constructor(private service: BrandAuthorizationsService) {}

  // ── Seller ───────────────────────────────────────────────────────────────
  @Post()
  submit(@Request() req, @Body() dto: any) {
    return this.service.submit(req.user.id, dto);
  }

  @Get('mine')
  findMine(@Request() req, @Query('commerceProfileId', ParseIntPipe) commerceProfileId: number) {
    return this.service.findMine(req.user.id, commerceProfileId);
  }

  @Post(':id/evidence')
  addEvidence(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { documentType: string; cloudinaryPublicId: string; format: string },
  ) {
    return this.service.addEvidence(req.user.id, id, dto);
  }

  @Get(':id/evidence/:evidenceId/signed-url')
  getSignedEvidenceUrl(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Param('evidenceId', ParseIntPipe) evidenceId: number,
  ) {
    const isAdmin =
      req.user.role === UserRole.ADMIN || !!req.user.activeRoles?.includes(UserRole.ADMIN);
    return this.service.getSignedEvidenceUrl(req.user.id, isAdmin, id, evidenceId);
  }

  // ── Admin ────────────────────────────────────────────────────────────────
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('admin')
  findAllAdmin(@Query('status') status?: string) {
    return this.service.findAllAdmin(status);
  }

  // Full audit trail for one authorization — spec §24's "Audit — full
  // history" admin capability. The data was already written correctly by
  // every transition; this is the first endpoint that exposes it.
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get(':id/audit')
  getAuditLog(@Param('id', ParseIntPipe) id: number) {
    return this.service.getAuditLog(id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch(':id/approve')
  approve(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.service.approve(id, req.user);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch(':id/reject')
  reject(@Request() req, @Param('id', ParseIntPipe) id: number, @Body('reason') reason: string) {
    return this.service.reject(id, req.user, reason);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch(':id/suspend')
  suspend(@Request() req, @Param('id', ParseIntPipe) id: number, @Body('reason') reason: string) {
    return this.service.suspend(id, req.user, reason);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch(':id/revoke')
  revoke(@Request() req, @Param('id', ParseIntPipe) id: number, @Body('reason') reason: string) {
    return this.service.revoke(id, req.user, reason);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch(':id/renew')
  renew(@Request() req, @Param('id', ParseIntPipe) id: number, @Body('expiresAt') expiresAt: string) {
    return this.service.renew(id, req.user, expiresAt);
  }
}
