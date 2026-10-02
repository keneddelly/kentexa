/**
 * SuperAgentCommissionModule — Stage 3S-C5.
 *
 * Deliberately its own new, small, top-level module rather than folded into
 * SuperAgentsModule or TransportModule: this is a genuinely new economic
 * authority (Super Agent handling commission + cash-desk collection), not an
 * extension of either existing module's own responsibilities, and keeping it
 * separate means this gate touches zero lines in any already-approved
 * C1-C4 file. ParcelCustodyEvent is registered here too (TypeORM allows an
 * entity to be registered in more than one module's forFeature array) purely
 * for read access -- this module never writes to it.
 *
 * No controller yet -- matches this whole Stage 3S-C lineage's own
 * established precedent (TransportRunService/ParcelRunAssignmentService also
 * have none as of C4): the service layer itself, directly exercised by real-
 * PostgreSQL tests, is "the minimal interface necessary to exercise the new
 * foundation securely" for this gate.
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SuperAgentHandlingRate } from './entities/super-agent-handling-rate.entity';
import { SuperAgentHandlingEarning } from './entities/super-agent-handling-earning.entity';
import { SuperAgentHandlingEarningObligation } from './entities/super-agent-handling-earning-obligation.entity';
import { SuperAgentCashCollection } from './entities/super-agent-cash-collection.entity';
import { SuperAgentSettlementProposal } from './entities/super-agent-settlement-proposal.entity';
import { SuperAgentSettlementEarningMember } from './entities/super-agent-settlement-earning-member.entity';
import { SuperAgentSettlementCashCollectionMember } from './entities/super-agent-settlement-cash-collection-member.entity';
import { SuperAgentCashRemittance } from './entities/super-agent-cash-remittance.entity';
import { SuperAgentCashRemittanceAllocation } from './entities/super-agent-cash-remittance-allocation.entity';
import { SuperAgentHandlingEarningPayout } from './entities/super-agent-handling-earning-payout.entity';
import { SuperAgentHandlingEarningPayoutAllocation } from './entities/super-agent-handling-earning-payout-allocation.entity';
import { ParcelCustodyEvent } from '../super-agents/entities/parcel-custody-event.entity';
import { SuperAgentHandlingRateService } from './super-agent-handling-rate.service';
import { SuperAgentHandlingEarningService } from './super-agent-handling-earning.service';
import { SuperAgentHandlingEarningObligationService } from './super-agent-handling-earning-obligation.service';
import { SuperAgentCashCollectionService } from './super-agent-cash-collection.service';
import { SuperAgentSettlementService } from './super-agent-settlement.service';
import { SuperAgentCashRemittanceService } from './super-agent-cash-remittance.service';
import { SuperAgentHandlingEarningPayoutService } from './super-agent-handling-earning-payout.service';
import { ActivityModule } from '../activity/activity.module';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [
    // Stage 3S-C6 second correction: SuperAgentHandlingEarningService (the
    // ambiguous-duplicate flag) and SuperAgentHandlingEarningObligationService
    // (best-effort/failure telemetry) both use ActivityEventService as
    // supplemental telemetry -- never the financial source of truth.
    // One-directional (ActivityModule imports nothing from here).
    ActivityModule,
    // Stage 3S-C7: SuperAgentHandlingEarningPayoutService is the ONE place
    // real wallet money moves for Super Agent commission, via the existing
    // WalletService.creditWallet()/getOrCreateSuperAgentWallet() primitives
    // -- never a second, competing writer. One-directional (WalletModule
    // imports nothing from here) -- no circularity.
    WalletModule,
    TypeOrmModule.forFeature([
      SuperAgentHandlingRate,
      SuperAgentHandlingEarning,
      SuperAgentHandlingEarningObligation,
      SuperAgentCashCollection,
      SuperAgentSettlementProposal,
      SuperAgentSettlementEarningMember,
      SuperAgentSettlementCashCollectionMember,
      SuperAgentCashRemittance,
      SuperAgentCashRemittanceAllocation,
      SuperAgentHandlingEarningPayout,
      SuperAgentHandlingEarningPayoutAllocation,
      ParcelCustodyEvent,
    ]),
  ],
  providers: [
    SuperAgentHandlingRateService,
    SuperAgentHandlingEarningService,
    SuperAgentHandlingEarningObligationService,
    SuperAgentCashCollectionService,
    SuperAgentSettlementService,
    SuperAgentCashRemittanceService,
    SuperAgentHandlingEarningPayoutService,
  ],
  exports: [
    SuperAgentHandlingRateService,
    SuperAgentHandlingEarningService,
    SuperAgentHandlingEarningObligationService,
    SuperAgentCashCollectionService,
    SuperAgentSettlementService,
    SuperAgentCashRemittanceService,
    SuperAgentHandlingEarningPayoutService,
  ],
})
export class SuperAgentCommissionModule {}
