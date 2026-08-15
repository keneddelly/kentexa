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

@Module({
  imports: [
    ReputationModule,
    CommerceProfilesModule,
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60000, limit: 100 }]),
    TypeOrmModule.forFeature([
      TransportProvider,
      TransportRoute,
      ProviderAvailability,
      TransportAssignment,
      ServiceAd, // for auto-linking transport providers to service marketplace
      User,
    ]),
  ],
  controllers: [TransportController],
  providers: [TransportService],
  exports: [TransportService],
})
export class TransportModule {}
