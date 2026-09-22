import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Wallet } from './entities/wallet.entity';
import { WalletTransaction } from './entities/wallet-transaction.entity';
import { User } from '../users/entities/user.entity';
import { Order } from '../orders/entities/order.entity';
import { WalletService } from './wallet.service';
import { WalletController, AdminWalletController } from './wallet.controller';
import { BusinessModule } from '../business/business.module';
import { IdentityModule } from '../identity/identity.module';
import { PaymentCoreModule } from '../payments/payment-core.module';

@Module({
  imports: [
    // S0 fix: WalletService's constructor injects the Order repository (the wallet-credit
    // backstop's own Order lookup) — this was missing here, which fails Nest DI at boot
    // ("OrderRepository at index [3] is not available in WalletModule").
    TypeOrmModule.forFeature([Wallet, WalletTransaction, User, Order]),
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
