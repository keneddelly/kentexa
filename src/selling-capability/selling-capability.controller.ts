import { Controller, Post, UseGuards } from '@nestjs/common';
import { SellingCapabilityBackfillService } from './selling-capability-backfill.service';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@Controller('selling-capability')
export class SellingCapabilityController {
  constructor(private readonly backfill: SellingCapabilityBackfillService) {}

  @Post('admin/backfill')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  runBackfill() {
    return this.backfill.run();
  }
}
