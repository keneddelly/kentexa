import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource, EntityManager } from 'typeorm';
import {
  MoneyRoutingBlockReason,
  MoneyRoutingEntry,
  MoneyRoutingEventType,
  MoneyRoutingState,
  MoneyRoutingTargetType,
} from './entities/money-routing-entry.entity';
import {
  MoneyRoutingBlockedException,
  OrderRoutingTarget,
  resolveOrderRoutingTarget,
} from './order-routing-target';
import { WalletService } from '../wallet/wallet.service';
import { WalletTransactionType } from '../wallet/entities/wallet-transaction.entity';
import { OwnershipFeatureFlagsService } from '../ownership/ownership-feature-flags.service';

export type MoneyRoutingSource =
  | 'ESCROW_RELEASE'
  | 'WEBHOOK_SETTLEMENT'
  | 'COD_DELIVERY'
  | 'DIGITAL_AUTO_COMPLETE'
  | 'INVOICE_PAID';

export interface RoutingOutcome {
  entryId: number | null;
  eventKey: string | null;
  state: MoneyRoutingState | 'NOT_APPLICABLE';
  blockReason?: MoneyRoutingBlockReason | null;
  blockDetail?: Record<string, unknown> | null;
}

const MAX_ATTEMPTS = 8;
const BACKOFF_BASE_SECONDS = 30;

/** Canonical, immutable event identity. Future financial events (refund, adjustment, ...) use their own keys. */
export const sellerProceedsEventKey = (orderId: number) => `ORDER:${orderId}:SELLER_PROCEEDS`;

/**
 * Fail-closed money routing (I2G).
 *
 * Every seller credit is an entry in money_routing_entry keyed by an
 * immutable event key. Webhook, escrow release, COD and invoice-paid are all
 * *observations* of the SAME 'ORDER:<id>:SELLER_PROCEEDS' event; they converge
 * on one entry, and the ledger row is UNIQUE per entry, so a credit can never
 * be applied twice. If the destination cannot be proven the entry is BLOCKED
 * with a stable reason -- it is never sent to the owner's Personal wallet.
 *
 * State machine (only these transitions):
 *   (none) -> PENDING            entry created with a resolved target
 *   (none) -> BLOCKED            target unresolvable at creation
 *   PENDING -> ROUTED            credit + ledger row committed atomically
 *   PENDING -> BLOCKED           unresolvable / amount conflict / retries exhausted
 *   BLOCKED -> PENDING           only via resolveBlocked() (re-derives the target)
 *   PENDING|BLOCKED -> CANCELLED cancelEntry() (order refunded before credit)
 *   ROUTED, CANCELLED            terminal
 */
@Injectable()
export class MoneyRoutingService {
  private readonly logger = new Logger(MoneyRoutingService.name);

  constructor(
    private dataSource: DataSource,
    private wallets: WalletService,
    private flags: OwnershipFeatureFlagsService,
  ) {}

  /**
   * Release guard: call BEFORE completing an escrow release / settlement. If
   * the seller proceeds cannot be routed, a BLOCKED entry is recorded (for
   * investigation) and the release is refused with a stable, structured error.
   * Never changes ownership.
   */
  async assertRoutable(orderId: number, amount: number, source: MoneyRoutingSource): Promise<void> {
    if (!this.flags.isEnabled('RELEASE_GUARD_ENFORCE')) return;
    if (!(amount > 0)) return; // nothing to route
    const target = await resolveOrderRoutingTarget(this.dataSource.manager, orderId);
    if (target.kind !== 'BLOCKED') return;
    await this.recordBlocked(orderId, amount, source, target);
    throw new MoneyRoutingBlockedException(target.reason, target.detail);
  }

  /**
   * Credit the seller's proceeds for an order, idempotently and fail-closed.
   * Safe to call from any number of triggers/retries. Returns the outcome; a
   * BLOCKED outcome is a normal, durable result (not swallowed).
   */
  async creditSellerProceeds(input: {
    orderId: number;
    amount: number;
    source: MoneyRoutingSource;
    ref?: string | null;
  }): Promise<RoutingOutcome> {
    const { orderId, source } = input;
    const amount = Math.round(Number(input.amount) * 100) / 100;
    if (!(amount > 0)) return { entryId: null, eventKey: null, state: 'NOT_APPLICABLE' };
    const eventKey = sellerProceedsEventKey(orderId);

    // 1) Ensure the entry exists (own transaction, so a later credit failure never loses it).
    const target = await resolveOrderRoutingTarget(this.dataSource.manager, orderId);
    if (target.kind === 'NOT_APPLICABLE') return { entryId: null, eventKey, state: 'NOT_APPLICABLE' };
    const entryId = await this.ensureEntry(orderId, eventKey, amount, source, input.ref ?? null, target);

    // 2) A different amount for the same immutable event never credits: block for review.
    await this.observeAmount(orderId, amount);

    // 3) Route it (idempotent; row-locked).
    return this.routeEntry(entryId);
  }

  private async ensureEntry(
    orderId: number,
    eventKey: string,
    amount: number,
    source: MoneyRoutingSource,
    ref: string | null,
    target: OrderRoutingTarget,
  ): Promise<number> {
    const blocked = target.kind === 'BLOCKED';
    const targetType = target.kind === 'TARGET' ? target.targetType : MoneyRoutingTargetType.UNRESOLVED;
    const observation = JSON.stringify([{ source, at: new Date().toISOString(), ref }]);
    return this.dataSource.transaction(async (m) => {
      await m.query(
        `INSERT INTO money_routing_entry ("eventKey","eventType","orderId",amount,"targetType","targetWorkspaceId","targetUserId",state,"blockReason","blockDetail",observations,"nextAttemptAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb, now())
         ON CONFLICT ("eventKey") DO NOTHING`,
        [
          eventKey, MoneyRoutingEventType.SELLER_PROCEEDS, orderId, amount, targetType,
          target.kind === 'TARGET' ? target.workspaceId : null,
          target.kind === 'TARGET' ? target.userId : null,
          blocked ? MoneyRoutingState.BLOCKED : MoneyRoutingState.PENDING,
          blocked ? target.reason : null,
          blocked ? JSON.stringify(target.detail) : null,
          observation,
        ],
      );
      const rows = await m.query(`SELECT id, observations FROM money_routing_entry WHERE "eventKey" = $1 FOR UPDATE`, [eventKey]);
      const row = rows[0];
      const obs: Array<{ source: string; ref?: string | null }> = row.observations ?? [];
      if (!obs.some((o) => o.source === source && (o.ref ?? null) === ref)) {
        await m.query(
          `UPDATE money_routing_entry SET observations = observations || $2::jsonb WHERE id = $1`,
          [row.id, JSON.stringify([{ source, at: new Date().toISOString(), ref }])],
        );
      }
      return row.id as number;
    });
  }

  /** Lock the entry, and if PENDING credit it exactly once. */
  async routeEntry(entryId: number): Promise<RoutingOutcome> {
    try {
      return await this.dataSource.transaction(async (m) => {
        const rows = await m.query(`SELECT * FROM money_routing_entry WHERE id = $1 FOR UPDATE`, [entryId]);
        const e: any = rows[0];
        if (!e) return { entryId, eventKey: null, state: 'NOT_APPLICABLE' } as RoutingOutcome;
        const outcome = (state: MoneyRoutingState): RoutingOutcome => ({
          entryId: e.id, eventKey: e.eventKey, state, blockReason: e.blockReason, blockDetail: e.blockDetail,
        });
        if (e.state === MoneyRoutingState.ROUTED || e.state === MoneyRoutingState.CANCELLED || e.state === MoneyRoutingState.BLOCKED) {
          return outcome(e.state);
        }

        // PENDING: re-derive the target from the order NOW (never trust a stale snapshot).
        const target = await resolveOrderRoutingTarget(m, e.orderId);
        if (target.kind === 'BLOCKED') {
          await this.markBlocked(m, e.id, target.reason, target.detail);
          return { entryId: e.id, eventKey: e.eventKey, state: MoneyRoutingState.BLOCKED, blockReason: target.reason, blockDetail: target.detail };
        }
        if (target.kind === 'NOT_APPLICABLE') {
          await this.markBlocked(m, e.id, MoneyRoutingBlockReason.SELLER_MISSING, { orderId: e.orderId });
          return { entryId: e.id, eventKey: e.eventKey, state: MoneyRoutingState.BLOCKED, blockReason: MoneyRoutingBlockReason.SELLER_MISSING };
        }
        const sameTarget =
          e.targetType === target.targetType &&
          (e.targetWorkspaceId ?? null) === (target.workspaceId ?? null) &&
          (e.targetUserId ?? null) === (target.userId ?? null);
        if (!sameTarget) {
          // The order's ownership changed since the entry was created: refuse rather than follow a stale/changed target silently.
          const detail = { orderId: e.orderId, recorded: { type: e.targetType, workspaceId: e.targetWorkspaceId, userId: e.targetUserId }, derived: target };
          await this.markBlocked(m, e.id, MoneyRoutingBlockReason.WALLET_UNRESOLVABLE, detail);
          return { entryId: e.id, eventKey: e.eventKey, state: MoneyRoutingState.BLOCKED, blockReason: MoneyRoutingBlockReason.WALLET_UNRESOLVABLE, blockDetail: detail };
        }

        const wallet = target.targetType === MoneyRoutingTargetType.BUSINESS_WORKSPACE
          ? await this.wallets.getOrCreateBusinessWallet(target.workspaceId, m)
          : await this.wallets.getOrCreatePersonalWallet(target.userId, m);
        const credit = await this.wallets.creditWallet(m, wallet.id, Number(e.amount), {
          type: WalletTransactionType.CREDIT_ESCROW_RELEASE,
          referenceType: 'order',
          referenceId: e.orderId,
          routingEntryId: e.id,
        });
        await m.query(
          `UPDATE money_routing_entry SET state = 'ROUTED', "walletTransactionId" = $2, "routedAt" = now(), "lastError" = NULL WHERE id = $1`,
          [e.id, credit.transactionId],
        );
        return { entryId: e.id, eventKey: e.eventKey, state: MoneyRoutingState.ROUTED };
      });
    } catch (err: any) {
      return this.recordTransientFailure(entryId, err);
    }
  }

  /**
   * A later trigger presenting a DIFFERENT amount for the same seller-proceeds
   * event never credits: the entry (unless already ROUTED) is BLOCKED for
   * review.
   */
  async observeAmount(orderId: number, amount: number): Promise<void> {
    const eventKey = sellerProceedsEventKey(orderId);
    await this.dataSource.query(
      `UPDATE money_routing_entry
          SET state = 'BLOCKED', "blockReason" = 'AMOUNT_CONFLICT',
              "blockDetail" = jsonb_build_object('orderId', "orderId", 'recordedAmount', amount, 'observedAmount', $2::numeric)
        WHERE "eventKey" = $1 AND state = 'PENDING' AND amount <> $2::numeric`,
      [eventKey, amount],
    );
  }

  private async markBlocked(m: EntityManager, entryId: number, reason: MoneyRoutingBlockReason, detail: Record<string, unknown> | null) {
    await m.query(
      `UPDATE money_routing_entry SET state = 'BLOCKED', "blockReason" = $2, "blockDetail" = $3::jsonb, "targetType" = 'UNRESOLVED',
              "targetWorkspaceId" = NULL, "targetUserId" = NULL WHERE id = $1`,
      [entryId, reason, detail ? JSON.stringify(detail) : null],
    );
  }

  private async recordBlocked(orderId: number, amount: number, source: MoneyRoutingSource, target: Extract<OrderRoutingTarget, { kind: 'BLOCKED' }>) {
    await this.ensureEntry(orderId, sellerProceedsEventKey(orderId), Math.round(amount * 100) / 100, source, null, target);
  }

  private async recordTransientFailure(entryId: number, err: any): Promise<RoutingOutcome> {
    const message = String(err?.message ?? err).slice(0, 500);
    const rows = await this.dataSource.query(
      `UPDATE money_routing_entry
          SET attempts = attempts + 1, "lastError" = $2,
              "nextAttemptAt" = now() + (LEAST(attempts + 1, 10)::int * $3::int * interval '1 second'),
              state = CASE WHEN attempts + 1 >= $4 THEN 'BLOCKED' ELSE state END,
              "blockReason" = CASE WHEN attempts + 1 >= $4 THEN 'RETRY_EXHAUSTED' ELSE "blockReason" END,
              "blockDetail" = CASE WHEN attempts + 1 >= $4 THEN jsonb_build_object('lastError', $2::text) ELSE "blockDetail" END
        WHERE id = $1 AND state = 'PENDING' RETURNING id, "eventKey", state, "blockReason", "blockDetail"`,
      [entryId, message, BACKOFF_BASE_SECONDS, MAX_ATTEMPTS],
    );
    this.logger.error(`money routing entry ${entryId} failed transiently: ${message}`);
    const r = rows[0];
    return { entryId, eventKey: r?.eventKey ?? null, state: (r?.state as MoneyRoutingState) ?? MoneyRoutingState.PENDING, blockReason: r?.blockReason ?? null, blockDetail: r?.blockDetail ?? null };
  }

  /** Retry worker: PENDING entries whose backoff has elapsed. BLOCKED entries are never auto-retried. */
  @Cron(CronExpression.EVERY_MINUTE)
  async retryDue(): Promise<number> {
    const due: Array<{ id: number }> = await this.dataSource.query(
      `SELECT id FROM money_routing_entry WHERE state = 'PENDING' AND "nextAttemptAt" <= now() ORDER BY id LIMIT 50`,
    );
    for (const d of due) await this.routeEntry(d.id);
    return due.length;
  }

  /**
   * Audited operator action: BLOCKED -> PENDING after the underlying data has
   * been fixed by an approved process. The target is RE-DERIVED from the order
   * on the next route; an operator can never type a destination.
   */
  async resolveBlocked(entryId: number, operatorUserId: number, note: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE money_routing_entry SET state = 'PENDING', "blockReason" = NULL, "blockDetail" = NULL, attempts = 0,
              "nextAttemptAt" = now(), "resolvedByUserId" = $2, "resolutionNote" = $3
        WHERE id = $1 AND state = 'BLOCKED'`,
      [entryId, operatorUserId, note],
    );
  }

  async cancelEntry(entryId: number, operatorUserId: number, note: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE money_routing_entry SET state = 'CANCELLED', "resolvedByUserId" = $2, "resolutionNote" = $3
        WHERE id = $1 AND state IN ('PENDING','BLOCKED')`,
      [entryId, operatorUserId, note],
    );
  }

  async listBlocked(): Promise<MoneyRoutingEntry[]> {
    return this.dataSource.query(`SELECT * FROM money_routing_entry WHERE state = 'BLOCKED' ORDER BY id`);
  }
}
