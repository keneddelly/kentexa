/**
 * TzPricingController — Shipping price estimation API
 *
 * GET /pricing/estimate?from=Dar+es+Salaam&to=Mwanga&weight=2
 * GET /pricing/providers?from=Dar+es+Salaam&to=Moshi&weight=5
 * GET /pricing/route?originCity=Dar+es+Salaam&destDistrictId=14
 */
import { Controller, Get, Query } from '@nestjs/common';
import { TzPricingService } from './tz-pricing.service';

@Controller('pricing')
export class TzPricingController {
  constructor(private readonly pricingService: TzPricingService) {}

  // Simple estimate — main endpoint used by SellerShipment and Checkout
  @Get('estimate')
  estimate(
    @Query('from')           from:           string,
    @Query('to')             to:             string,
    @Query('weight')         weight?:        string,
    @Query('destDistrictId') destDistrictId?: string,
    @Query('destDistrict')   destDistrict?:  string,
    @Query('originRegion')   originRegion?:  string,
    @Query('destRegion')     destRegion?:    string,
  ) {
    if (!from || !to) return { error: 'from and to are required' };
    return this.pricingService.estimate({
      originCity:       from,
      destinationCity:  to,
      weightKg:         weight ? Number(weight) : 1,
      destDistrictId:   destDistrictId ? Number(destDistrictId) : undefined,
      destDistrictName: destDistrict,
      originRegion,
      destRegion,
    });
  }

  // All providers for a route (future: comparison UI)
  @Get('providers')
  providers(
    @Query('from')   from:    string,
    @Query('to')     to:      string,
    @Query('weight') weight?: string,
  ) {
    if (!from || !to) return { error: 'from and to are required' };
    return this.pricingService.estimateAllProviders({
      originCity:      from,
      destinationCity: to,
      weightKg:        weight ? Number(weight) : 1,
    });
  }
}