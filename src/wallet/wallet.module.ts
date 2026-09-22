import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Wallet } from './entities/wallet.entity';
import { WalletTransaction } from './entities/wallet-transaction.entity';
import { User } from '../users/entities/user.entity';
import { WalletService } from './wallet.service';
import { WalletController, AdminWalletController } from './wallet.controller';
import { BusinessModule } from '../business/business.module';
import { IdentityModule } from '../identity/identity.module';
import { PaymentCoreModule } from '../payments/payment-core.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Wallet, WalletTransaction, User]),
    BusinessModule,
    IdentityModule,
    // S0 — the final fail-closed defence: creditFromEscrowRelease() re-checks PaymentEvidence for a
    // checkout order regardless of which caller thinks it's entitled to release funds.
    PaymentCoreModule,
  ],
  controllers: [WalletController, AdminWalletController],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
