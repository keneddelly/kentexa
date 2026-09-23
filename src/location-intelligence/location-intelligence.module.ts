/**
 * LocationIntelligenceModule — Stage 2A. Place at:
 * src/location-intelligence/location-intelligence.module.ts
 *
 * Not wired into any consumer (Shipment/checkout/business address/etc.) in
 * this stage, per the mission's explicit scope boundary. Registered in
 * app.module.ts's imports so it exists as a real, injectable module for a
 * later stage to consume, without doing so itself yet.
 */
import { Module } from '@nestjs/common';
import { TzLocationModule } from '../tz-location/tz-location.module';
import { LocationIntelligenceService } from './location-intelligence.service';
import { TzSeedLocationProvider } from './providers/tz-seed-location.provider';

@Module({
  imports: [TzLocationModule],
  providers: [TzSeedLocationProvider, LocationIntelligenceService],
  exports: [LocationIntelligenceService],
})
export class LocationIntelligenceModule {}
