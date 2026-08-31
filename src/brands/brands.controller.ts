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
import { BrandsService } from './brands.service';
import { BrandDashboardService } from './brand-dashboard.service';

@Controller('brands')
export class BrandsController {
  constructor(
    private service: BrandsService,
    private dashboard: BrandDashboardService,
  ) {}

  // ── Brand's own read-only dashboard (Phase C) — owner or an authorized
  // CommerceProfileMember only, enforced inside the service. ─────────────
  @UseGuards(JwtAuthGuard)
  @Get('dashboard/:commerceProfileId')
  getDashboard(
    @Param('commerceProfileId', ParseIntPipe) commerceProfileId: number,
    @Request() req,
  ) {
    return this.dashboard.getDashboard(commerceProfileId, req.user.id);
  }

  // ── Public — the product-creation picker and storefront display.
  // includeInactive is safe to expose unauthenticated (no evidence/PII
  // here) — the admin brand-management page is the only real consumer of
  // it, but there's nothing to protect by gating it. ─────────────────────
  @Get()
  findAll(@Query('search') search?: string, @Query('includeInactive') includeInactive?: string) {
    if (search) return this.service.search(search);
    return this.service.findAll(includeInactive === 'true');
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  // ── Admin ────────────────────────────────────────────────────────────────
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post()
  create(@Body() dto: any) {
    return this.service.create(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.service.update(id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch(':id/verify')
  verify(
    @Param('id', ParseIntPipe) id: number,
    @Body('status') status: 'unverified' | 'verified',
  ) {
    return this.service.setVerificationStatus(id, status);
  }

  // Grants (or reassigns) a real Kentexa account as this brand's identity
  // owner — always admin-provisioned, see brands.service.ts's own comment.
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post(':id/assign-owner')
  assignOwner(
    @Param('id', ParseIntPipe) id: number,
    @Body('userId', ParseIntPipe) userId: number,
  ) {
    return this.service.createOrReassignProfile(id, userId);
  }
}
