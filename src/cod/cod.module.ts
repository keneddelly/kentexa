import { Module } from '@nestjs/common';
import { CodCalculationService } from './cod-calculation.service';

@Module({
  providers: [CodCalculationService],
  exports: [CodCalculationService],
})
export class CodModule {}
