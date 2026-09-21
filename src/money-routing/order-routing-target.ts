import type { EntityManager } from 'typeorm';
import { ConflictException } from '@nestjs/common';
import {
  MoneyRoutingBlockReason,
  MoneyRoutingTargetType,
} from './entities/money-routing-entry.entity';

type Runner = Pick<EntityManager, 'query'>;

export type OrderRoutingTarget =
  | { kind: 'NOT_APPLICABLE'; reason: 'NO_SELLER'; orderId: number }
  | { kind: 'TARGET'; targetType: MoneyRoutingTargetType.BUSINESS_WORKSPACE; workspaceId: number; userId: null }
  | { kind: 'TARGET'; targetType: MoneyRoutingTargetType.PERSONAL_USER; workspaceId: null; userId: number }
  | { kind: 'BLOCKED'; reason: MoneyRoutingBlockReason; detail: Record<string, unknown> };

/** Thrown when money cannot be safely routed. Carries a stable code + investigation identifiers. */
export class MoneyRoutingBlockedException extends ConflictException {
  constructor(public readonly reason: MoneyRoutingBlockReason, public readonly detail: Record<string, unknown>) {
    super({ code: 'MONEY_ROUTING_BLOCKED', reason, detail, message: `MONEY_ROUTING_BLOCKED:${reason}` });
  }
}

/**
 * THE fail-closed money-routing decision for a seller credit on an order.
 * The destination derives from the ORDER'S canonical workspace ownership --
 * never from sellerId alone -- and never falls back from a Business resource
 * to the owner's Personal wallet:
 *
 *  R1  order.workspaceId set                          -> that workspace's Business wallet
 *  R2  workspaceId NULL but a canonical parent
 *      (Product / Classified) is workspace-stamped     -> BLOCKED (PARENT_STAMPED_ORDER_UNSTAMPED)
 *  R3  workspaceId NULL, no stamped parent, seller
 *      has an ACTIVE Selling Business                  -> BLOCKED (AMBIGUOUS_LEGACY_OWNER)
 *      seller has no ACTIVE Selling Business           -> explicit Personal wallet of the seller
 *  R4  no seller (hub / logistics side, Class D)       -> NOT_APPLICABLE (no seller credit exists)
 *
 * Read-only: it never writes and never assigns ownership.
 */
export async function resolveOrderRoutingTarget(runner: Runner, orderId: number): Promise<OrderRoutingTarget> {
  const rows = await runner.query(
    `SELECT o.id, o."sellerId", o."workspaceId", o."productId", o.source::text AS source,
            p."workspaceId" AS "productWorkspaceId",
            (SELECT c.id FROM classified_invoice_request r JOIN classified c ON c.id = r."classifiedId"
              WHERE r."orderRefId" = o.id AND c."workspaceId" IS NOT NULL LIMIT 1) AS "classifiedId",
            (SELECT c."workspaceId" FROM classified_invoice_request r JOIN classified c ON c.id = r."classifiedId"
              WHERE r."orderRefId" = o.id AND c."workspaceId" IS NOT NULL LIMIT 1) AS "classifiedWorkspaceId"
       FROM "order" o LEFT JOIN product p ON p.id = o."productId"
      WHERE o.id = $1`,
    [orderId],
  );
  const o = rows[0];
  if (!o) return { kind: 'BLOCKED', reason: MoneyRoutingBlockReason.ORDER_NOT_FOUND, detail: { orderId } };

  if (o.workspaceId != null) {
    const ws = await runner.query(`SELECT id FROM operational_workspace WHERE id = $1`, [o.workspaceId]);
    if (!ws[0]) {
      return { kind: 'BLOCKED', reason: MoneyRoutingBlockReason.WORKSPACE_MISSING, detail: { orderId, workspaceId: o.workspaceId } };
    }
    return { kind: 'TARGET', targetType: MoneyRoutingTargetType.BUSINESS_WORKSPACE, workspaceId: o.workspaceId, userId: null };
  }

  if (o.productWorkspaceId != null || o.classifiedWorkspaceId != null) {
    return {
      kind: 'BLOCKED',
      reason: MoneyRoutingBlockReason.PARENT_STAMPED_ORDER_UNSTAMPED,
      detail: {
        orderId,
        sellerId: o.sellerId,
        productId: o.productId,
        productWorkspaceId: o.productWorkspaceId,
        classifiedId: o.classifiedId,
        classifiedWorkspaceId: o.classifiedWorkspaceId,
      },
    };
  }

  if (o.sellerId == null) return { kind: 'NOT_APPLICABLE', reason: 'NO_SELLER', orderId };

  const businesses = await runner.query(
    `SELECT b.id AS "businessId", w.id AS "workspaceId"
       FROM business b
       JOIN operational_workspace w ON w."businessId" = b.id
       JOIN business_capability bc ON bc."workspaceId" = w.id AND bc."capabilityCode"::text = 'commerce' AND bc.status::text = 'active'
      WHERE b."userId" = $1`,
    [o.sellerId],
  );
  if (businesses.length > 0) {
    return {
      kind: 'BLOCKED',
      reason: MoneyRoutingBlockReason.AMBIGUOUS_LEGACY_OWNER,
      detail: { orderId, sellerId: o.sellerId, source: o.source, sellingBusinesses: businesses },
    };
  }
  return { kind: 'TARGET', targetType: MoneyRoutingTargetType.PERSONAL_USER, workspaceId: null, userId: o.sellerId };
}
