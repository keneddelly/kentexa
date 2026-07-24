import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DisputesService }    from './disputes.service';
import { DisputesController } from './disputes.controller';
import { Dispute } from './entities/dispute.entity';
import { Order }   from '../orders/entities/order.entity';
import { User }    from '../users/entities/user.entity';
import { SmsModule } from '../sms/sms.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Dispute, Order, User]),
    SmsModule,
  ],
  controllers: [DisputesController],
  providers:   [DisputesService],
  exports:     [DisputesService],
})
export class DisputesModule {}