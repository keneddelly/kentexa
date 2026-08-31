import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { DistributorsService } from './distributors.service';

// Reads are any-authenticated-user (a seller submitting a brand-
// authorization request needs to pick from this list); mutations are
// admin-only — opened up to a real distributor-account login only once a
// distributor dashboard is actually built (see brands.module.ts
// "explicitly deferred").
@UseGuards(JwtAuthGuard)
@Controller('distributors')
export class DistributorsController {
  constructor(private service: DistributorsService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Get(':id/brands')
  listBrands(@Param('id', ParseIntPipe) id: number) {
    return this.service.listBrandsFor(id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post()
  create(@Body() dto: any) {
    return this.service.create(dto);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.service.update(id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post(':id/brands/:brandId')
  associateWithBrand(
    @Param('id', ParseIntPipe) id: number,
    @Param('brandId', ParseIntPipe) brandId: number,
    @Body() scope: { categoryScope?: string; regionScope?: string },
  ) {
    return this.service.associateWithBrand(id, brandId, scope);
  }
}
