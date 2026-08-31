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
import { OfficialProductsService } from './official-products.service';

@Controller('official-products')
export class OfficialProductsController {
  constructor(private service: OfficialProductsService) {}

  // ── Brand-managed catalog authoring (spec §20) — auth is the service's
  // own CommerceProfileScopeService check (same posture as
  // BrandsController's /brands/dashboard/:commerceProfileId), not a role
  // guard, since any authenticated user might legitimately own a brand
  // profile. Declared before the public ':id' catch-all below so the
  // literal 'mine' segment is never swallowed by it. ─────────────────────
  @UseGuards(JwtAuthGuard)
  @Get('mine/:commerceProfileId')
  findAllForOwner(
    @Param('commerceProfileId', ParseIntPipe) commerceProfileId: number,
    @Request() req,
  ) {
    return this.service.findAllForOwner(commerceProfileId, req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('mine/:commerceProfileId')
  createForOwner(
    @Param('commerceProfileId', ParseIntPipe) commerceProfileId: number,
    @Body() dto: any,
    @Request() req,
  ) {
    return this.service.createForOwner(commerceProfileId, req.user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('mine/:commerceProfileId/:id')
  updateForOwner(
    @Param('commerceProfileId', ParseIntPipe) commerceProfileId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: any,
    @Request() req,
  ) {
    return this.service.updateForOwner(commerceProfileId, req.user.id, id, dto);
  }

  // ── Public — the seller-side officialProductId picker ───────────────────
  @Get()
  findAll(@Query('brandId') brandId?: string, @Query('search') search?: string) {
    const brandIdNum = brandId ? Number(brandId) : undefined;
    return search ? this.service.search(search, brandIdNum) : this.service.findAll(brandIdNum);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  // ── Admin — see brands.controller.ts for the identical guard pattern.
  // Opened up to a real brand/distributor account only once one is
  // actually onboarded (same deferral as Phase A's Distributor CRUD). ────
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
}
