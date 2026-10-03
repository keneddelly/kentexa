/**
 * SuperAgentHandlingEarningPayoutService — Stage 3S-C7 Part B-B: the one
 * place real wallet money moves for Super Agent handling commission.
 *
 * Deliberately NOT wired to any controller, scheduler, or automatic
 * custody hook in this gate -- "no public/live controller route,
 * scheduler, automatic custody hook, production feature flag activation...
 * is authorized." This is a standalone, explicitly-invoked, internal
 * authority, proven correct against real PostgreSQL; turning it on for
 * real Super Agents with real money is a separate authorization.
 *
 * Payout always acts on exactly one FROZEN settlement proposal's own scope
 * (SuperAgentSettlementProposal) -- never an ad-hoc set of earnings.
 *
 * Stage 3S-C7 correction (review verdict on `81582da`): the proposal's own
 * `totalCashOutstandingAmount` is a frozen snapshot of cash exposure AT
 * SETTLEMENT-CREATION TIME, for historical/audit reporting -- it is never
 * rewritten, and must NEVER be re-used as a live payout gate. Using it that
 * way created a dead-end lifecycle: a settlement created before its cash
 * collections were remitted would freeze outstanding > 0, and since that
 * frozen number can never change, payout would stay blocked FOREVER even
 * after every one of those exact collections was later, genuinely remitted
 * (their earnings/cash rows are already globally claimed by this finalized
 * proposal, so a replacement proposal can't simply reclaim them either).
 *
 * The fail-closed gate below instead revalidates, AT PAYOUT TIME, the LIVE
 * reconciliation state of exactly this proposal's own frozen cash-member
 * set (`super_agent_settlement_cash_collection_member`) against the real,
 * independently-evolving `super_agent_cash_remittance_allocation` table --
 * so a settlement becomes payable the moment its claimed collections are
 * actually remitted, with no mutation of the proposal row itself. The
 * frozen `totalCashOutstandingAmount` stays exactly as computed at
 * creation -- "state at proposal creation," never "current payout
 * eligibility."
 *
 * Atomicity: the wallet credit (WalletService.creditWallet) and the
 * payout/allocation ledger rows are written in ONE database transaction.
 * The credit happens FIRST, then the payout row (UNIQUE on
 * settlementProposalId) -- if the payout insert fails (a concurrent/
 * retried call already paid this settlement), the WHOLE transaction rolls
 * back, undoing the credit too, and the caller is handed back the
 * ALREADY-COMMITTED payout from whichever attempt actually won. This is
 * what "concurrent/retried payout credits exactly once" and "failure
 * after wallet update cannot leave payout ledger inconsistent" both mean
 * in practice: there is no code path where the credit survives without
 * its own payout row, or the payout row exists without the credit.
 */
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { SuperAgentHandlingEarningPayout } from './entities/super-agent-handling-earning-payout.entity';
import { SuperAgentHandlingEarningPayoutAllocation } from './entities/super-agent-handling-earning-payout-allocation.entity';
import { SuperAgentSettlementProposal } from './entities/super-agent-settlement-proposal.entity';
import { WalletService } from '../wallet/wallet.service';
import { WalletTransactionType } from '../wallet/entities/wallet-transaction.entity';

const UNIQUE_VIOLATION = '23505';

export interface PayoutActor {
  userId: number | null;
}

@Injectable()
export class SuperAgentHandlingEarningPayoutService {
  constructor(
    @InjectRepository(SuperAgentHandlingEarningPayout) private payoutRepo: Repository<SuperAgentHandlingEarningPayout>,
    @InjectRepository(SuperAgentSettlementProposal) private proposalRepo: Repository<SuperAgentSettlementProposal>,
    private readonly walletService: WalletService,
    private readonly dataSource: DataSource,
  ) {}

  async findBySettlementId(settlementProposalId: number): Promise<SuperAgentHandlingEarningPayout | null> {
    return this.payoutRepo.findOne({ where: { settlementProposalId } });
  }

  async payoutSettlement(settlementProposalId: number, actor: PayoutActor): Promise<SuperAgentHandlingEarningPayout> {
    const proposal = await this.proposalRepo.findOne({ where: { id: settlementProposalId } });
    if (!proposal) throw new NotFoundException('Settlement proposal not found');

    if (!(Number(proposal.totalEarningsAmount) > 0)) {
      throw new ConflictException('Nothing to pay out for this settlement');
    }

    try {
      return await this.dataSource.transaction(async (manager) => {
        // Serializes concurrent payout attempts for the SAME Super Agent,
        // and -- critically -- serializes against SuperAgentCashRemittance-
        // Service.recordRemittance's OWN identical lock, so the live
        // reconciliation check just below can never race a concurrent
        // remittance that is still mid-commit.
        await manager.query('SELECT id FROM public.super_agent WHERE id = $1 FOR UPDATE', [proposal.superAgentId]);

        // Fail closed on LIVE cash exposure (see this file's own header
        // comment for why this can never be the proposal's frozen
        // totalCashOutstandingAmount): every cash collection this proposal
        // claimed must currently have a real remittance allocation.
        const unresolved = await manager.query(
          `SELECT count(*)::int AS n
             FROM public.super_agent_settlement_cash_collection_member m
             LEFT JOIN public.super_agent_cash_remittance_allocation a
               ON a."cashCollectionId" = m."cashCollectionId"
            WHERE m."settlementProposalId" = $1 AND a.id IS NULL`,
          [proposal.id],
        );
        if (unresolved[0].n > 0) {
          throw new ConflictException(
            `Payout blocked: ${unresolved[0].n} cash collection(s) claimed by this settlement are not yet remitted`,
          );
        }

        // Resolved inside the SAME locked transaction as the check above
        // (not before it) -- a blocked payout must leave no trace, not even
        // an idle, uncredited wallet row.
        const wallet = await this.walletService.getOrCreateSuperAgentWallet(proposal.superAgentId, manager);

        const { transactionId } = await this.walletService.creditWallet(manager, wallet.id, Number(proposal.totalEarningsAmount), {
          type: WalletTransactionType.SUPER_AGENT_COMMISSION_PAYOUT,
          referenceType: 'super_agent_settlement_proposal',
          referenceId: proposal.id,
        });

        const payoutRepo = manager.getRepository(SuperAgentHandlingEarningPayout);
        const payout = await payoutRepo.save(payoutRepo.create({
          settlementProposalId: proposal.id,
          superAgentId: proposal.superAgentId,
          currency: proposal.currency,
          amount: proposal.totalEarningsAmount,
          walletTransactionId: transactionId,
          actorUserId: actor.userId,
        }));

        const members = await manager.query(
          `SELECT "earningId" FROM public.super_agent_settlement_earning_member WHERE "settlementProposalId" = $1`,
          [settlementProposalId],
        );
        const allocationRepo = manager.getRepository(SuperAgentHandlingEarningPayoutAllocation);
        for (const m of members) {
          await allocationRepo.insert({ payoutId: payout.id, earningId: m.earningId });
        }

        return payout;
      });
    } catch (error: any) {
      if (error?.code === UNIQUE_VIOLATION) {
        // A concurrent/retried call already paid this exact settlement --
        // this attempt's own credit (if it got that far) was rolled back
        // with the rest of its transaction; return the real winner's row.
        return this.payoutRepo.findOneOrFail({ where: { settlementProposalId } });
      }
      throw error;
    }
  }
}
