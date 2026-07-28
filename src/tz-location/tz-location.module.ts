import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TzRegion } from './entities/tz-region.entity';
import { TzDistrict } from './entities/tz-district.entity';
import { TzWard } from './entities/tz-ward.entity';
import { TzLocationService } from './tz-location.service';
import { TzLocationController } from './tz-location.controller';

@Module({
  imports: [TypeOrmModule.forFeature([TzRegion, TzDistrict, TzWard])],
  controllers: [TzLocationController],
  providers: [TzLocationService],
  exports: [TzLocationService], // other modules can inject and use
})
export class TzLocationModule {}
