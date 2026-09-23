/**
 * LocationIntelligenceModule — Stage 2A. Place at:
 * src/location-intelligence/location-intelligence.module.ts
 *
 * Stage 2D wires the first real consumer: the standalone Shipment create path
 * (via ShipmentsModule) resolves client-selected place references exactly
 * through LocationIntelligenceService.resolve(), and this module exposes the
 * public place-discovery endpoint the client uses to obtain those references.
 * Still no persisted Place and no external provider.
 */
import { Module } from '@nestjs/common';
import { TzLocationModule } from '../tz-location/tz-location.module';
import { LocationIntelligenceController } from './location-intelligence.controller';
import { LocationIntelligenceService } from './location-intelligence.service';
import { TzSeedLocationProvider } from './providers/tz-seed-location.provider';

@Module({
  imports: [TzLocationModule],
  controllers: [LocationIntelligenceController],
  providers: [TzSeedLocationProvider, LocationIntelligenceService],
  exports: [LocationIntelligenceService],
})
export class LocationIntelligenceModule {}
