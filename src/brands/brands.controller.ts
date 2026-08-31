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
import { BrandAuthorizationsService } from './brand-authorizations.service';

@Controller('brands')
export class BrandsController {
  constructor(
    private service: BrandsService,
    private dashboard: BrandDashboardService,
    private authorizations: BrandAuthorizationsService,
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

  // ── AI/NL brand query integration (spec §23) — the 'business' search
  // domain's real endpoint (Search.js calls this directly, the same way
  // its existing 'hub'/'transport' domain branches call their own real
  // endpoints rather than a search-specific one). Public, and deliberately
  // fails open to an empty list rather than throwing — this is reached
  // straight off an AI domain guess and must never surface as a hard
  // error on the search page. Declared before ':id' so a literal
  // 'authorized-businesses' path segment is never swallowed by that
  // catch-all.
  @Get('authorized-businesses')
  async authorizedBusinesses(@Query('brand') brand?: string, @Query('city') city?: string) {
    const resolved = brand ? await this.service.findByName(brand) : null;
    if (!resolved) return { brand: null, businesses: [] };
    const businesses = await this.authorizations.findAuthorizedBusinesses(resolved.id, { city });
    return {
      brand: { id: resolved.id, name: resolved.name, logoUrl: resolved.logoUrl },
      businesses,
    };
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
