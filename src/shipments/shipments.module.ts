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

@Module({
  imports: [
    TypeOrmModule.forFeature([Shipment, TransportRoute]),
    TransportModule,
    TzLocationModule,
  ],
  controllers: [ShipmentsController],
  providers: [ShipmentsService],
  exports: [ShipmentsService],
})
export class ShipmentsModule {}
