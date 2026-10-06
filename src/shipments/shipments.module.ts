/**
 * ShipmentsModule
 * Place at: src/shipments/shipments.module.ts
 * Register in: src/app.module.ts
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Shipment } from './entities/shipment.entity';
import { TransportRoute } from '../transport/entities/transport-route.entity';
import { TransportQuote } from '../transport/entities/transport-quote.entity';
import { ShipmentsService } from './shipments.service';
import { ShipmentsController } from './shipments.controller';
import { TransportModule } from '../transport/transport.module';
import { TzLocationModule } from '../tz-location/tz-location.module';
import { LocationIntelligenceModule } from '../location-intelligence/location-intelligence.module';
import { Parcel } from '../super-agents/entities/parcel.entity';
import { SuperAgent } from '../super-agents/entities/super-agent.entity';
import { PickupTasksService } from './pickup-tasks.service';
import { PickupTasksController } from './pickup-tasks.controller';
import { SmsModule } from '../sms/sms.module';
import { ShipmentActivationService } from './shipment-activation.service';

@Module({
  imports: [
    // Parcel/SuperAgent: repo-only, same reasoning as TransportModule's own
    // repo-only registration — lets confirmShipment() create the Parcel a
    // confirmed Shipment becomes (Phase 3) and resolve an origin SuperAgent
    // by city, without importing SuperAgentsModule as a whole.
    TypeOrmModule.forFeature([Shipment, TransportRoute, TransportQuote, Parcel, SuperAgent]),
    TransportModule,
    TzLocationModule,
    // Stage 2D: server-side, exact re-resolution of selected place references.
    LocationIntelligenceModule,
    // Gate 4: the recipient's delivery code for a direct Agent delivery.
    SmsModule,
  ],
  controllers: [ShipmentsController, PickupTasksController],
  providers: [ShipmentsService, PickupTasksService, ShipmentActivationService],
  exports: [ShipmentsService],
})
export class ShipmentsModule {}
