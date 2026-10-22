/**
 * COD collected by an Agent on a seller shipment (Order.source = SELLER_SHIPMENT):
 * the steps after the recipient's code has proved delivery and the custody event is
 * written. The same steps, split and amounts as the hub path's manual branch
 * (SuperAgentsService.confirmCodAgentDelivery, left untouched), used by the boda rider
 * path (PickupTasksService.deliver), so both settle a COD the same way.
 *
 * The seller was paid by the buyer outside KenteXa's escrow (a manual order), so no
 * seller release runs here: the Agent owes only KenteXa's share of the handling fee.
 * The boda fee (Parcel.agreedDeliveryFee) is the rider's own and is never in this money.
 * Must run inside the caller's transaction, after the Order row is locked.
 */
import { ConflictException } from '@nestjs/common';
import { COD_HANDLING_FEE_PERCENT, COD_HANDLING_FEE_KENTEXA_SHARE_PERCENT } from '../cod/cod-policy.config';
import { PaymentStatus as OrderPaymentStatus, OrderStatus } from '../orders/entities/order.entity';

export interface AgentCodSplit { handlingFee: number; kentexaShare: number; agentShare: number }

/** The COD handling fee on the collected balance, and how it splits between KenteXa and the Agent. */
export function agentCodSplit(expectedAmount: number): AgentCodSplit {
  const handlingFee = Math.round(expectedAmount * COD_HANDLING_FEE_PERCENT) / 100;
  const kentexaShare = Math.round(handlingFee * COD_HANDLING_FEE_KENTEXA_SHARE_PERCENT) / 100;
  const agentShare = Math.round((handlingFee - kentexaShare) * 100) / 100;
  return { handlingFee, kentexaShare, agentShare };
}

/** The Order columns a collected COD sets (status delivered, paid in full). */
export function codCollectedOrderUpdate(agentId: number, now: Date) {
  return {
    codBalanceCollected: true, codBalanceCollectedByLocalAgentId: agentId,
    codBalanceCollectedAt: now, paymentStatus: OrderPaymentStatus.PAID,
    status: OrderStatus.DELIVERED, deliveredAt: now,
  };
}

export interface SettleManualCodInput {
  order: { id: number; source: string; totalAmount: number | string | null };
  parcelId: number;
  custodyEventId: number;
  agent: { id: number; deliveryCommission?: number | string | null };
  expectedAmount: number;
  /** InvoicesService.recordCodBalanceCollected, run in the same transaction. */
  recordInvoice: (manager: any) => Promise<unknown>;
  now?: Date;
  /** When false the caller updates the Order itself (the hub path does, after its own steps). */
  updateOrder?: boolean;
  /**
   * What the Agent owes in cash. A seller shipment (paid outside escrow): only KenteXa's
   * share of the handling fee (the default). A marketplace COD: the whole amount, because
   * the seller is paid through the release service instead.
   */
  cashLiability?: number;
  /** When false the caller has already proved the balance is uncollected (the hub path locks and checks it). */
  assertNotCollected?: boolean;
}

/**
 * Records the collection (agent_cod_collection), the Agent's earnings and the invoice,
 * and (by default) completes the Order. The Order must already be locked FOR UPDATE.
 */
export async function settleManualAgentCod(manager: any, input: SettleManualCodInput): Promise<AgentCodSplit> {
  const { order, agent, expectedAmount } = input;
  const split = agentCodSplit(expectedAmount);
  if (input.assertNotCollected !== false) {
    const [row] = await manager.query('SELECT "codBalanceCollected" FROM public."order" WHERE id=$1', [order.id]);
    if (!row || row.codBalanceCollected) throw new ConflictException('COD balance already collected');
  }
  // One collection per Order: agent_cod_collection."orderId" is unique, so a second
  // delivery of the same COD fails here even if every other guard were bypassed.
  await manager.query(`INSERT INTO public.agent_cod_collection
    ("orderId","parcelId","custodyEventId","agentId","collectedAmount","cashLiability",
     "handlingFee","kentexaShare","agentShare","orderSource")
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
  [order.id, input.parcelId, input.custodyEventId, agent.id, expectedAmount, input.cashLiability ?? split.kentexaShare,
    split.handlingFee, split.kentexaShare, split.agentShare, order.source]);

  await manager.query('UPDATE public.agent SET "totalDeliveriesCompleted"="totalDeliveriesCompleted"+1 WHERE id=$1', [agent.id]);
  const deliveryCommission = Number(agent.deliveryCommission || 0);
  const commission = Number.isFinite(deliveryCommission) && deliveryCommission > 0 ? deliveryCommission : 0;
  if (commission > 0) {
    await manager.query('UPDATE public.agent SET "totalEarningsDeliveries"="totalEarningsDeliveries"+$1 WHERE id=$2', [commission, agent.id]);
  }
  if (split.agentShare > 0) {
    await manager.query('UPDATE public.agent SET "totalEarningsPayments"="totalEarningsPayments"+$1 WHERE id=$2', [split.agentShare, agent.id]);
  }
  const totalEarned = commission + split.agentShare;
  if (totalEarned > 0) {
    await manager.query('UPDATE public.agent SET "totalEarnings"="totalEarnings"+$1 WHERE id=$2', [totalEarned, agent.id]);
  }
  await input.recordInvoice(manager);
  if (input.updateOrder !== false) {
    const u = codCollectedOrderUpdate(agent.id, input.now ?? new Date());
    await manager.query(`UPDATE public."order" SET "codBalanceCollected"=$1,"codBalanceCollectedByLocalAgentId"=$2,
      "codBalanceCollectedAt"=$3,"paymentStatus"=$4,status=$5,"deliveredAt"=$6 WHERE id=$7`,
    [u.codBalanceCollected, u.codBalanceCollectedByLocalAgentId, u.codBalanceCollectedAt, u.paymentStatus,
      u.status, u.deliveredAt, order.id]);
  }
  return split;
}
