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
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { OfficialProductsService } from './official-products.service';

@Controller('official-products')
export class OfficialProductsController {
  constructor(private service: OfficialProductsService) {}

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
