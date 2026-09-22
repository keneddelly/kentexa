import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Wallet } from './entities/wallet.entity';
import { WalletTransaction } from './entities/wallet-transaction.entity';
import { PayoutDestination } from './entities/payout-destination.entity';
import { MoneyRoutingEntry } from '../money-routing/entities/money-routing-entry.entity';
import { FinancialReconciliationJournal } from '../money-routing/entities/financial-reconciliation-journal.entity';
import { User } from '../users/entities/user.entity';
import { Order } from '../orders/entities/order.entity';
import { WalletService } from './wallet.service';
import { PayoutPolicyService } from './payout-policy.service';
import { PayoutDestinationService } from './payout-destination.service';
import { MoneyRoutingService } from '../money-routing/money-routing.service';
import { MoneyRoutingAdminController } from '../money-routing/money-routing.controller';
import { WalletController, AdminWalletController } from './wallet.controller';
import {
  PayoutDestinationController,
  AdminPayoutDestinationController,
} from './payout-destination.controller';
import { BusinessModule } from '../business/business.module';
import { IdentityModule } from '../identity/identity.module';
import { PaymentCoreModule } from '../payments/payment-core.module';
import { OrderReleaseService } from '../money-routing/order-release.service';

@Module({
  imports: [
    // S0 fix: WalletService's constructor injects the Order repository (the wallet-credit
    // backstop's own Order lookup) — this was missing here, which fails Nest DI at boot
    // ("OrderRepository at index [3] is not available in WalletModule").
    // I2G: also registers the workspace-partition wallet/payout/routing entities the canonical
    // release boundary and payout-destination lifecycle need.
    TypeOrmModule.forFeature([
      Wallet,
      WalletTransaction,
      PayoutDestination,
      MoneyRoutingEntry,
      FinancialReconciliationJournal,
      User,
      Order,
    ]),
    BusinessModule,
    IdentityModule,
    // S0 — the final fail-closed defence: creditFromEscrowRelease() re-checks PaymentEvidence for a
    // checkout order regardless of which caller thinks it's entitled to release funds.
    PaymentCoreModule,
  ],
  controllers: [
    WalletController,
    AdminWalletController,
    PayoutDestinationController,
    AdminPayoutDestinationController,
    MoneyRoutingAdminController,
  ],
  providers: [WalletService, PayoutPolicyService, PayoutDestinationService, MoneyRoutingService, OrderReleaseService],
  exports: [WalletService, MoneyRoutingService, PayoutDestinationService, OrderReleaseService],
})
export class WalletModule {}
