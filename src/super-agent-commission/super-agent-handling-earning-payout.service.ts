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
 * (SuperAgentSettlementProposal) -- never an ad-hoc set of earnings --
 * because that's the only place "unresolved cash exposure" (the fail-
 * closed gate below) is already computed and frozen.
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

    // Fail closed: per the C7 scope decision, commission may be EARNED
    // independently of cash remittance, but it may never be PAID OUT while
    // this settlement's own scope still has unresolved cash exposure.
    if (Number(proposal.totalCashOutstandingAmount) > 0) {
      throw new ConflictException(
        `Payout blocked: this settlement has unresolved cash exposure of ${proposal.totalCashOutstandingAmount} ${proposal.currency}`,
      );
    }
    if (!(Number(proposal.totalEarningsAmount) > 0)) {
      throw new ConflictException('Nothing to pay out for this settlement');
    }

    const wallet = await this.walletService.getOrCreateSuperAgentWallet(proposal.superAgentId);

    try {
      return await this.dataSource.transaction(async (manager) => {
        // Serializes concurrent payout attempts for the SAME Super Agent --
        // belt-and-suspenders alongside the settlementProposalId uniqueness
        // below, mirroring this lineage's own established lock-before-write
        // convention.
        await manager.query('SELECT id FROM public.super_agent WHERE id = $1 FOR UPDATE', [proposal.superAgentId]);

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
