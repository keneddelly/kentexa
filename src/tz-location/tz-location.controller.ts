import { Controller, Get, Post, Query, Param, UseGuards } from '@nestjs/common';
import { TzLocationService } from './tz-location.service';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

/**
 * TzLocationController
 * Public endpoints — no auth needed (forms must load fast)
 * Admin endpoint for seeding Tanzania location data
 *
 * GET /locations/regions
 * GET /locations/districts?regionId=1
 * GET /locations/districts?region=Dar+es+Salaam
 * GET /locations/wards?districtId=1
 * GET /locations/wards?district=Kinondoni&region=Dar+es+Salaam
 * GET /locations/search?q=Bunju
 * GET /locations/delivery-type?originWard=1&destWard=2
 * GET /locations/resolve/:query
 * POST /locations/seed  (admin only)
 */
@Controller('locations')
export class TzLocationController {
  constructor(private readonly locationService: TzLocationService) {}

  @Get('regions')
  getRegions() {
    return this.locationService.getRegions();
  }

  @Get('districts')
  getDistricts(
    @Query('regionId') regionId?: string,
    @Query('region') region?: string,
  ) {
    if (regionId) return this.locationService.getDistricts(Number(regionId));
    if (region) return this.locationService.getDistrictsByRegionName(region);
    return [];
  }

  @Get('wards')
  getWards(
    @Query('districtId') districtId?: string,
    @Query('district') district?: string,
    @Query('region') region?: string,
  ) {
    if (districtId) return this.locationService.getWards(Number(districtId));
    if (district)
      return this.locationService.getWardsByDistrictName(district, region);
    return [];
  }

  @Get('search')
  search(@Query('q') q: string) {
    if (!q || q.length < 2) return [];
    return this.locationService.search(q);
  }

  @Get('delivery-type')
  deliveryType(
    @Query('originWard') originWard?: string,
    @Query('destWard') destWard?: string,
    @Query('originRegion') originRegion?: string,
    @Query('destRegion') destRegion?: string,
  ) {
    return this.locationService.resolveDeliveryType(
      originWard ? Number(originWard) : null,
      destWard ? Number(destWard) : null,
      originRegion,
      destRegion,
    );
  }

  @Get('resolve/:query')
  resolve(@Param('query') query: string) {
    return this.locationService.resolveAgentLocation(query);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('seed')
  seedLocations() {
    return this.locationService.seedAll();
  }
}
