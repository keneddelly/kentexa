import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
  Request,
} from '@nestjs/common';
import { WarrantyService } from './warranty.service';
import { WarrantyClaimStatus } from './entities/warranty-claim.entity';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { SellerScopeService } from '../business/seller-scope.service';
import { RoleContextGuard } from '../role-context/role-context.guard';
import { CurrentRoleContext } from '../role-context/current-role-context.decorator';
import { RoleContext } from '../role-context/role-context.types';
import { AccountRoleType } from '../role-context/entities/account-role.entity';

@Controller('warranty')
export class WarrantyController {
  constructor(
    private service: WarrantyService,
    private sellerScope: SellerScopeService,
  ) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('admin/claims')
  adminClaims() {
    return this.service.findAllClaimsAdmin();
  }

  // Full audit trail for one claim — spec §24's "Audit — full history"
  // admin capability. Declared with a literal 'claims' prefix, same as
  // the existing PATCH 'claims/:claimId/review' route below — no
  // ordering conflict with the bare ':id' catch-all further down.
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('claims/:claimId/audit')
  getClaimAudit(@Param('claimId', ParseIntPipe) claimId: number) {
    return this.service.getClaimAudit(claimId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('register')
  register(@Body('orderId', ParseIntPipe) orderId: number, @Body('serialNumber') serialNumber: string, @Request() req) {
    return this.service.register(orderId, req.user, { serialNumber });
  }

  @UseGuards(JwtAuthGuard)
  @Get('mine')
  mine(@Request() req) {
    return this.service.findMine(req.user.id);
  }

  @UseGuards(JwtAuthGuard, RoleContextGuard)
  @Patch('claims/:claimId/review')
  async reviewClaim(
    @Param('claimId', ParseIntPipe) claimId: number,
    @Body('status') status: WarrantyClaimStatus,
    @Body('resolution') resolution: string,
    @Request() req,
    @CurrentRoleContext() roleContext: RoleContext,
  ) {
    // Resolve the caller to their real seller identity (or an employer's, if
    // permissioned staff). Admin authority comes from the CURRENTLY ACTIVE
    // RoleContext, never the legacy req.user.role field.
    const sellerId = await this.sellerScope.resolve(req.user, 'canViewOrders').catch(() => req.user.id);
    return this.service.reviewClaim(
      claimId,
      { id: sellerId },
      { status, resolution },
      roleContext?.roleType === AccountRoleType.ADMIN,
    );
  }

  @UseGuards(JwtAuthGuard, RoleContextGuard)
  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Request() req,
    @CurrentRoleContext() roleContext: RoleContext,
  ) {
    return this.service.findOne(
      id,
      req.user,
      roleContext?.roleType === AccountRoleType.ADMIN,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/claims')
  fileClaim(
    @Param('id', ParseIntPipe) id: number,
    @Body('reason') reason: string,
    @Body('evidenceImages') evidenceImages: string[],
    @Request() req,
  ) {
    return this.service.fileClaim(id, req.user, { reason, evidenceImages });
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/claims')
  getClaims(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.service.getClaims(id, req.user);
  }
}
