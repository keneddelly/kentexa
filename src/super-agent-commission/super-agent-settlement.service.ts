/**
 * SuperAgentSettlementService — Stage 3S-C7 Part A: reconciliation /
 * settlement proposal computation. NO money movement anywhere in this
 * service -- it reads the C5/C6 earning/cash-collection ledgers, validates
 * them, and freezes a snapshot. See SuperAgentSettlementProposal's own
 * header comment for the five numbers this always reports and why they're
 * never netted into one.
 *
 * "Validate... not merely arithmetic": before summing anything, this
 * service checks for candidate rows in the SAME period/Super Agent but a
 * DIFFERENT currency than requested, and flags (rather than silently
 * drops) them via hasDiscrepancy/discrepancyNote. Scope ownership is
 * enforced structurally -- every candidate query filters on
 * superAgentId = $1, so a row belonging to a different Super Agent can
 * never be selected at all. Duplicate inclusion is prevented by the
 * settlement-membership tables' own global UNIQUE constraints (candidates
 * are, by construction, rows with no existing membership row yet).
 *
 * The target Super Agent row is locked (FOR UPDATE) for the duration of
 * settlement creation -- not because two different Super Agents' rows
 * could ever collide (ownership makes that structurally impossible), but
 * so two overlapping settlement-creation calls for the SAME Super Agent
 * serialize cleanly rather than each computing a candidate set before
 * either commits and then racing to claim the same rows.
 */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { SuperAgentSettlementProposal } from './entities/super-agent-settlement-proposal.entity';
import { SuperAgentSettlementEarningMember } from './entities/super-agent-settlement-earning-member.entity';
import { SuperAgentSettlementCashCollectionMember } from './entities/super-agent-settlement-cash-collection-member.entity';

export interface CreateSettlementProposalParams {
  superAgentId: number;
  currency: string;
  periodStart: Date;
  periodEnd: Date;
  actorUserId: number | null;
}

export interface SettlementDetail {
  proposal: SuperAgentSettlementProposal;
  earningIds: number[];
  cashCollectionIds: number[];
}

@Injectable()
export class SuperAgentSettlementService {
  constructor(
    @InjectRepository(SuperAgentSettlementProposal) private proposalRepo: Repository<SuperAgentSettlementProposal>,
    private readonly dataSource: DataSource,
  ) {}

  private async assertSuperAgentExists(superAgentId: number): Promise<void> {
    const rows = await this.dataSource.query('SELECT id FROM public.super_agent WHERE id = $1', [superAgentId]);
    if (!rows.length) throw new NotFoundException('Super Agent not found');
  }

  async findProposalById(id: number): Promise<SuperAgentSettlementProposal | null> {
    return this.proposalRepo.findOne({ where: { id } });
  }

  async getSettlementDetail(id: number): Promise<SettlementDetail> {
    const proposal = await this.proposalRepo.findOne({ where: { id } });
    if (!proposal) throw new NotFoundException('Settlement proposal not found');
    const earningRows = await this.dataSource.query(
      `SELECT "earningId" FROM public.super_agent_settlement_earning_member WHERE "settlementProposalId" = $1 ORDER BY "earningId" ASC`,
      [id],
    );
    const cashRows = await this.dataSource.query(
      `SELECT "cashCollectionId" FROM public.super_agent_settlement_cash_collection_member WHERE "settlementProposalId" = $1 ORDER BY "cashCollectionId" ASC`,
      [id],
    );
    return {
      proposal,
      earningIds: earningRows.map((r: any) => Number(r.earningId)),
      cashCollectionIds: cashRows.map((r: any) => Number(r.cashCollectionId)),
    };
  }

  async createSettlementProposal(params: CreateSettlementProposalParams): Promise<SuperAgentSettlementProposal> {
    if (!(params.periodEnd > params.periodStart)) {
      throw new BadRequestException('periodEnd must be after periodStart');
    }
    await this.assertSuperAgentExists(params.superAgentId);

    return this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT id FROM public.super_agent WHERE id = $1 FOR UPDATE', [params.superAgentId]);

      const earningRows = await manager.query(
        `SELECT e.id, e.amount FROM public.super_agent_handling_earning e
         LEFT JOIN public.super_agent_settlement_earning_member m ON m."earningId" = e.id
         WHERE e."superAgentId" = $1 AND e.currency = $2
           AND e."createdAt" >= $3 AND e."createdAt" < $4
           AND m.id IS NULL
         ORDER BY e.id ASC`,
        [params.superAgentId, params.currency, params.periodStart, params.periodEnd],
      );
      const offCurrencyEarnings = await manager.query(
        `SELECT count(*)::int AS n FROM public.super_agent_handling_earning
         WHERE "superAgentId" = $1 AND currency <> $2 AND "createdAt" >= $3 AND "createdAt" < $4`,
        [params.superAgentId, params.currency, params.periodStart, params.periodEnd],
      );

      const cashRows = await manager.query(
        `SELECT c.id, c."collectedAmount",
                (SELECT a."allocatedAmount" FROM public.super_agent_cash_remittance_allocation a WHERE a."cashCollectionId" = c.id) AS remitted
         FROM public.super_agent_cash_collection c
         LEFT JOIN public.super_agent_settlement_cash_collection_member m ON m."cashCollectionId" = c.id
         WHERE c."superAgentId" = $1 AND c.currency = $2
           AND c."createdAt" >= $3 AND c."createdAt" < $4
           AND m.id IS NULL
         ORDER BY c.id ASC`,
        [params.superAgentId, params.currency, params.periodStart, params.periodEnd],
      );
      const offCurrencyCash = await manager.query(
        `SELECT count(*)::int AS n FROM public.super_agent_cash_collection
         WHERE "superAgentId" = $1 AND currency <> $2 AND "createdAt" >= $3 AND "createdAt" < $4`,
        [params.superAgentId, params.currency, params.periodStart, params.periodEnd],
      );

      const totalEarningsAmount = earningRows.reduce((sum: number, r: any) => sum + Number(r.amount), 0);
      const totalCashCollectedAmount = cashRows.reduce((sum: number, r: any) => sum + Number(r.collectedAmount), 0);
      const totalCashRemittedAmount = cashRows.reduce((sum: number, r: any) => sum + Number(r.remitted ?? 0), 0);
      const totalCashOutstandingAmount = Number((totalCashCollectedAmount - totalCashRemittedAmount).toFixed(2));

      const discrepancies: string[] = [];
      if (offCurrencyEarnings[0].n > 0) {
        discrepancies.push(`${offCurrencyEarnings[0].n} handling earning(s) in this period use a different currency and were excluded`);
      }
      if (offCurrencyCash[0].n > 0) {
        discrepancies.push(`${offCurrencyCash[0].n} cash collection(s) in this period use a different currency and were excluded`);
      }

      const proposalRepo = manager.getRepository(SuperAgentSettlementProposal);
      const proposal = await proposalRepo.save(proposalRepo.create({
        superAgentId: params.superAgentId,
        currency: params.currency,
        periodStart: params.periodStart,
        periodEnd: params.periodEnd,
        totalEarningsAmount,
        totalEarningsCount: earningRows.length,
        totalCashCollectedAmount,
        totalCashCollectedCount: cashRows.length,
        totalCashRemittedAmount,
        totalCashOutstandingAmount,
        hasDiscrepancy: discrepancies.length > 0,
        discrepancyNote: discrepancies.length > 0 ? discrepancies.join('; ') : null,
        actorUserId: params.actorUserId,
      }));

      const earningMemberRepo = manager.getRepository(SuperAgentSettlementEarningMember);
      for (const r of earningRows) {
        await earningMemberRepo.insert({ settlementProposalId: proposal.id, earningId: r.id });
      }
      const cashMemberRepo = manager.getRepository(SuperAgentSettlementCashCollectionMember);
      for (const r of cashRows) {
        await cashMemberRepo.insert({ settlementProposalId: proposal.id, cashCollectionId: r.id });
      }

      return proposal;
    });
  }
}
