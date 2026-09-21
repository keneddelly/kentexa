import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Wallet } from './entities/wallet.entity';
import { WalletTransaction } from './entities/wallet-transaction.entity';
import { PayoutDestination } from './entities/payout-destination.entity';
import { MoneyRoutingEntry } from '../money-routing/entities/money-routing-entry.entity';
import { FinancialReconciliationJournal } from '../money-routing/entities/financial-reconciliation-journal.entity';
import { User } from '../users/entities/user.entity';
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

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Wallet,
      WalletTransaction,
      PayoutDestination,
      MoneyRoutingEntry,
      FinancialReconciliationJournal,
      User,
    ]),
    BusinessModule,
    IdentityModule,
  ],
  controllers: [
    WalletController,
    AdminWalletController,
    PayoutDestinationController,
    AdminPayoutDestinationController,
    MoneyRoutingAdminController,
  ],
  providers: [WalletService, PayoutPolicyService, PayoutDestinationService, MoneyRoutingService],
  exports: [WalletService, MoneyRoutingService, PayoutDestinationService],
})
export class WalletModule {}
