/**
 * ShipmentsModule
 * Place at: src/shipments/shipments.module.ts
 * Register in: src/app.module.ts
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Shipment } from './entities/shipment.entity';
import { TransportRoute } from '../transport/entities/transport-route.entity';
import { ShipmentsService } from './shipments.service';
import { ShipmentsController } from './shipments.controller';
import { TransportModule } from '../transport/transport.module';
import { TzLocationModule } from '../tz-location/tz-location.module';
import { Parcel } from '../super-agents/entities/parcel.entity';
import { SuperAgent } from '../super-agents/entities/super-agent.entity';

@Module({
  imports: [
    // Parcel/SuperAgent: repo-only, same reasoning as TransportModule's own
    // repo-only registration — lets confirmShipment() create the Parcel a
    // confirmed Shipment becomes (Phase 3) and resolve an origin SuperAgent
    // by city, without importing SuperAgentsModule as a whole.
    TypeOrmModule.forFeature([Shipment, TransportRoute, Parcel, SuperAgent]),
    TransportModule,
    TzLocationModule,
  ],
  controllers: [ShipmentsController],
  providers: [ShipmentsService],
  exports: [ShipmentsService],
})
export class ShipmentsModule {}
