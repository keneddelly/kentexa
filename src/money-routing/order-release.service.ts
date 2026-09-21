import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MoneyRoutingService, MoneyRoutingSource, RoutingOutcome } from './money-routing.service';
import { MoneyRoutingBlockedException, resolveOrderRoutingTarget } from './order-routing-target';
import { MoneyRoutingBlockReason, MoneyRoutingState } from './entities/money-routing-entry.entity';
import { qRows } from './pg-rows';

export type ReleaseSource = MoneyRoutingSource | 'DISPUTE_RESOLUTION' | 'ADMIN_RELEASE' | 'AUTO_RELEASE';

/** Order columns a release may set together with the release itself (completion / confirmation facts). */
const RELEASE_COMPANION_COLUMNS = new Set([
  'status', 'paymentStatus', 'buyerConfirmedAt', 'deliveredAt', 'completedAt', 'confirmationToken',
  'buyerRating', 'buyerReview', 'reviewedAt', 'superAgentRating', 'superAgentReview',
  'transportRating', 'transportReview', 'autoConfirmed', 'autoConfirmAt', 'disputeResolution',
]);

export interface ReleaseOutcome {
  released: true;
  /** true when the order had ALREADY been released (retry / legacy): no second credit, state simply converges. */
  alreadyReleased: boolean;
  routing: RoutingOutcome | null;
}

/**
 * THE canonical seller-release operation (I2G). Every path that releases escrow to a seller --
 * buyer confirmation, token confirmation, auto-release crons, dispute resolution, admin release,
 * digital auto-complete -- calls this and nothing else may write escrow RELEASED /
 * paymentStatus released / fundsReleasedAt.
 *
 *   ORDER LOCKED (FOR NO KEY UPDATE) -> RELEASE GUARD -> canonical event ORDER:<id>:SELLER_PROCEEDS
 *   -> idempotent wallet routing -> RELEASE STATE COMMITTED
 *
 * all in ONE database transaction. If the proceeds cannot be routed (BLOCKED: unresolved/ambiguous
 * ownership, amount conflict, cancelled by refund) the release state is NOT written (this is unconditional: there is no flag that skips routing), the wallet is
 * untouched, the BLOCKED routing entry is committed for investigation, and a
 * MoneyRoutingBlockedException is thrown. There is never a fall-back to the owner's Personal wallet.
 * Repeated calls (webhook/cron/buyer/admin retries) converge: an already-ROUTED event is not
 * credited twice and an already-released order simply returns.
 */
@Injectable()
export class OrderReleaseService {
  private readonly logger = new Logger(OrderReleaseService.name);

  constructor(
    private dataSource: DataSource,
    private routing: MoneyRoutingService,
  ) {}

  async releaseSellerProceeds(input: {
    orderId: number;
    source: ReleaseSource;
    /** Completion facts to write atomically WITH the release (allow-listed order columns only). */
    orderUpdate?: Record<string, unknown>;
    ref?: string | null;
  }): Promise<ReleaseOutcome> {
    const { orderId } = input;
    const companion = Object.entries(input.orderUpdate ?? {}).filter(([, v]) => v !== undefined);
    for (const [column] of companion) {
      if (!RELEASE_COMPANION_COLUMNS.has(column)) {
        throw new ConflictException({ code: 'RELEASE_COLUMN_NOT_ALLOWED', message: `RELEASE_COLUMN_NOT_ALLOWED:${column}` });
      }
    }

    let blocked: { reason: MoneyRoutingBlockReason; detail: Record<string, unknown> } | null = null;

    const result = await this.dataSource.transaction(async (m): Promise<ReleaseOutcome | null> => {
      // NO KEY UPDATE serialises concurrent releases of this order but does not block the foreign-key
      // share locks the routing entry insert takes on the same row.
      const rows = await m.query(
        `SELECT id, "sellerId", "sellerAmount", "escrowStatus"::text AS "escrowStatus"
           FROM "order" WHERE id = $1 FOR NO KEY UPDATE`,
        [orderId],
      );
      const order = rows[0];
      if (!order) throw new NotFoundException(`Order #${orderId} not found`);

      if (order.escrowStatus === 'released') {
        return { released: true, alreadyReleased: true, routing: null }; // convergent retry
      }
      if (order.escrowStatus === 'refunded') {
        throw new ConflictException({ code: 'ORDER_ESCROW_NOT_RELEASABLE', message: 'ORDER_ESCROW_NOT_RELEASABLE', orderId });
      }

      const amount = Math.round(Number(order.sellerAmount || 0) * 100) / 100;
      let routing: RoutingOutcome | null = null;

      // Routing is MANDATORY whenever there is a seller and positive proceeds. No flag, config or
      // rollback mode can skip it: the only "nothing owed" cases are no seller / amount <= 0.
      if (order.sellerId != null && amount > 0) {
        const target = await resolveOrderRoutingTarget(m, orderId);
        // for a BLOCKED target this durably records the BLOCKED entry (committed) and touches no wallet
        routing = await this.routing.creditSellerProceedsIn(m, { orderId, amount, source: input.source as MoneyRoutingSource, ref: input.ref ?? null });
        if (target.kind === 'BLOCKED') {
          blocked = { reason: target.reason, detail: target.detail };
          return null;
        }
        if (routing.state === MoneyRoutingState.CANCELLED) {
          throw new ConflictException({ code: 'ORDER_SELLER_PROCEEDS_CANCELLED', message: 'ORDER_SELLER_PROCEEDS_CANCELLED', orderId });
        }
        if (routing.state !== MoneyRoutingState.ROUTED) {
          // includes NOT_APPLICABLE for a seller order: not an escape hatch -> hold, fail closed
          blocked = {
            reason: (routing.blockReason as MoneyRoutingBlockReason) ?? MoneyRoutingBlockReason.WALLET_UNRESOLVABLE,
            detail: (routing.blockDetail as Record<string, unknown>) ?? { orderId },
          };
          return null;
        }
      }

      // Routing succeeded (or nothing is owed): commit the release state in the same transaction.
      const sets: string[] = ['"escrowStatus" = \'released\'', '"payoutStatus" = \'released\'', '"fundsReleasedAt" = now()'];
      const params: unknown[] = [orderId];
      for (const [column, value] of companion) {
        params.push(value);
        sets.push(`"${column}" = $${params.length}`);
      }
      const upd = await qRows(m, `UPDATE "order" SET ${sets.join(', ')} WHERE id = $1 RETURNING id`, params);
      if (!upd[0]) throw new NotFoundException(`Order #${orderId} not found`);
      return { released: true, alreadyReleased: false, routing };
    });

    if (result === null) {
      const b = blocked as unknown as { reason: MoneyRoutingBlockReason; detail: Record<string, unknown> } | null;
      throw new MoneyRoutingBlockedException(b?.reason ?? MoneyRoutingBlockReason.WALLET_UNRESOLVABLE, b?.detail ?? { orderId });
    }
    return result;
  }

  /** Refunds are NOT seller proceeds: a buyer refund only cancels any not-yet-routed seller-proceeds entry. */
  async recordBuyerRefund(orderId: number, note: string): Promise<void> {
    await this.routing.cancelSellerProceedsForRefund(orderId, note);
  }
}
