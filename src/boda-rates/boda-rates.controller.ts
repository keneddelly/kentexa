import {
  Controller,
  Get,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { BodaRatesService } from './boda-rates.service';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

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

  // Admin — get all rates
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('all')
  getAllRates() {
    return this.service.getAllRates();
  }

  // Admin — update a rate by key
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch(':rateKey')
  updateRate(
    @Param('rateKey') rateKey: string,
    @Body()
    dto: {
      fee?: number;
      label?: string;
      isActive?: boolean;
      keywords?: string[];
      category?: string;
    },
  ) {
    if (dto.fee !== undefined && (!Number.isFinite(dto.fee) || dto.fee < 0)) {
      throw new BadRequestException('fee must be a non-negative number');
    }
    return this.service.updateRate(rateKey, dto);
  }
}
