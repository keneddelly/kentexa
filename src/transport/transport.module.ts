/**
 * TransportModule
 * Place at: src/transport/transport.module.ts
 * Register in: src/app.module.ts
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { TransportProvider } from './entities/transport-provider.entity';
import { TransportRoute } from './entities/transport-route.entity';
import { ProviderAvailability } from './entities/provider-availability.entity';
import { TransportAssignment } from './entities/transport-assignment.entity';
import { ServiceAd } from '../services/entities/service-ad.entity';
import { User } from '../users/entities/user.entity';
import { TransportService } from './transport.service';
import { TransportController } from './transport.controller';
import { ReputationModule } from '../reputation/reputation.module';
import { CommerceProfilesModule } from '../commerce-profiles/commerce-profiles.module';
import { TzLocationModule } from '../tz-location/tz-location.module';
import { Parcel, ParcelTracking } from '../super-agents/entities/parcel.entity';
import { SuperAgent } from '../super-agents/entities/super-agent.entity';
import { Shipment } from '../shipments/entities/shipment.entity';

@Module({
  imports: [
    ReputationModule,
    CommerceProfilesModule,
    TzLocationModule,
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60000, limit: 100 }]),
    TypeOrmModule.forFeature([
      TransportProvider,
      TransportRoute,
      ProviderAvailability,
      TransportAssignment,
      ServiceAd, // for auto-linking transport providers to service marketplace
      User,
      // Repo-only access into the super-agents/shipments entities — NOT a
      // module import (super-agents/shipments never import TransportModule
      // for their entities, so this stays one-directional; ShipmentsModule
      // itself already depends on TransportModule the other way, so
      // importing ShipmentsModule here would be circular — registering
      // just the Shipment repository avoids that entirely). Needed so
      // createAssignment() can validate a caller-supplied parcelId and
      // updateAssignmentStatus() can sync a transport event onto the
      // Parcel/Shipment it's carrying (Phases 1, 3-5).
      Parcel,
      ParcelTracking,
      SuperAgent,
      Shipment,
    ]),
  ],
  controllers: [TransportController],
  providers: [TransportService],
  exports: [TransportService],
})
export class TransportModule {}
