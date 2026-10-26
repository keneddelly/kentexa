import { Module } from '@nestjs/common';
import { AdvertisersService } from './advertisers.service';
import { AdvertisersController } from './advertisers.controller';

// Raw SQL on its own tables only (DataSource): no dependency on other feature modules,
// so AuthModule can import it for the registration step without a cycle.
@Module({
  controllers: [AdvertisersController],
  providers: [AdvertisersService],
  exports: [AdvertisersService],
})
export class AdvertisersModule {}
