import { Controller, Get, Patch, Body, Param, Query } from '@nestjs/common';
import { BodaRatesService } from './boda-rates.service';

@Controller('boda-rates')
export class BodaRatesController {
  constructor(private readonly service: BodaRatesService) {}

  // Public — calculate fee for given address + weight
  @Get('calculate')
  calculate(
    @Query('address') address: string,
    @Query('weightKg') weightKg: string,
  ) {
    return this.service.calculateFee(address, Number(weightKg) || 0);
  }

  // Public — rate card summary
  @Get('summary')
  getSummary() {
    return this.service.getRateCardSummary();
  }

  // Admin — get all rates (frontend handles auth via requireAdmin)
  @Get('all')
  getAllRates() {
    return this.service.getAllRates();
  }

  // Admin — update a rate by key
  @Patch(':rateKey')
  updateRate(
    @Param('rateKey') rateKey: string,
    @Body() dto: { fee?: number; label?: string; isActive?: boolean; keywords?: string[]; category?: string },
  ) {
    return this.service.updateRate(rateKey, dto);
  }
}