import { ReleaseHarness, setupReleaseHarness } from './i2g-release-harness';
import { MoneyRoutingBlockedException } from './order-routing-target';
import { OrdersService } from '../orders/orders.service';
import { PaymentsService } from '../payments/payments.service';
import { InvoicesService } from '../invoices/invoices.service';
import { ShippingService } from '../shipping/shipping.service';
import { DisputesService } from '../disputes/disputes.service';
import { DailyBatchesService } from '../daily-batches/daily-batches.service';
import { DisputeReason, DisputeResolution } from '../disputes/entities/dispute.entity';
import { AccountRoleType } from '../role-context/entities/account-role.entity';

/**
 * EVERY seller-release writer, run against real Postgres and the real canonical release. For each:
 *   routable order  -> proceeds routed to the resource's wallet once, order released, retry safe
 *   blocked order   -> wallet untouched, order NOT released, BLOCKED entry with a stable reason
 */
const anyStub: any = new Proxy(function () {}, {
  get: (_t, p) => (p === 'then' || typeof p === 'symbol' ? undefined : anyStub),
  apply: () => Promise.resolve(undefined),
});
/** A service instance whose named collaborators are real/explicit and every other collaborator is an inert stub. */
const build = <T>(Cls: { prototype: any }, props: Record<string, unknown>): T =>
  new Proxy(Object.assign(Object.create(Cls.prototype), props), {
    get: (t, p, r) => (p in t ? Reflect.get(t, p, r) : typeof p === 'symbol' ? undefined : anyStub),
  }) as T;

/** Chainable query-builder stub resolving getMany() to a fixed list. */
const qb = (rows: any[]) => {
  const chain: any = new Proxy({}, { get: (_t, p) => (p === 'getMany' ? async () => rows : () => chain) });
  return chain;
};

describe('I2G release-writer inventory — every seller-release path is closed through the canonical operation', () => {
  let h: ReleaseHarness;
  let release: any;
  beforeAll(async () => { h = await setupReleaseHarness(); }, 120000);
  afterAll(async () => { if (h?.reachable) await h.destroy(); });
  afterEach(() => jest.restoreAllMocks());

  it('§0 disposable database reachable', () => expect(h.reachable).toBe(true));

  // a Business owner with A/B, plus one routable and one blocked (R2) order for the scenario
  const world = async (label: string, opts: Parameters<ReleaseHarness['makeOrder']>[0] = {}) => {
    const owner = await h.makeUser(label);
    const A = await h.makeBusiness(owner, `${label}-A`, { selling: true });
    const B = await h.makeBusiness(owner, `${label}-B`, { selling: true });
    const product = await h.makeProduct(owner.id, A.workspace.id);
    const good = await h.makeOrder({ sellerId: owner.id, workspaceId: A.workspace.id, sellerAmount: 1000, ...opts });
    const blocked = await h.makeOrder({ sellerId: owner.id, workspaceId: null, productId: product, sellerAmount: 700, ...opts });
    return { owner, A, B, good, blocked };
  };
  const walletA = async (w: { A: { workspace: { id: number } } }) => (await h.wallets.getOrCreateBusinessWallet(w.A.workspace.id)).id;
  const walletB = async (w: { B: { workspace: { id: number } } }) => (await h.wallets.getOrCreateBusinessWallet(w.B.workspace.id)).id;
  const assertReleased = async (w: any, orderId: number, amount: number) => {
    const row = await h.orderRow(orderId);
    expect(row.escrowStatus).toBe('released');
    expect(row.fundsReleasedAt).toBeTruthy();
    expect(await h.ledgerRows(orderId)).toHaveLength(1);
    expect(await h.balanceOf(await walletA(w))).toBe(amount); // A's order credits A ...
    expect(await h.balanceOf(await walletB(w))).toBe(0); // ... never B
    expect(await h.balanceOf((await h.wallets.getOrCreatePersonalWallet(w.owner.id)).id)).toBe(0); // ... never Personal
  };
  const assertHeld = async (orderId: number) => {
    const row = await h.orderRow(orderId);
    expect(row.escrowStatus).not.toBe('released');
    expect(row.fundsReleasedAt).toBeNull();
    expect(await h.ledgerRows(orderId)).toHaveLength(0);
    expect(await h.entryOf(orderId)).toMatchObject({ state: 'BLOCKED', blockReason: 'PARENT_STAMPED_ORDER_UNSTAMPED' });
  };
  const orderRepoStub = () => ({
    update: async (id: number, fields: Record<string, any>) => {
      const sets = Object.keys(fields).map((k, i) => `"${k}" = $${i + 2}`);
      if (sets.length) await h.q(`UPDATE "order" SET ${sets.join(', ')} WHERE id = $1`, [id, ...Object.values(fields)]);
    },
  });

  beforeAll(() => { release = () => h.release; });

  // ── 1. ShippingService.buyerConfirmDelivery ─────────────────────────────
  it('ShippingService.buyerConfirmDelivery: routed once + released; blocked stays unreleased; retry safe', async () => {
    if (!h.reachable) return;
    const w = await world('ShipBuyer', { status: 'delivered' });
    const svc: any = build(ShippingService, {
      orderRelease: h.release,
      orderRepo: { findOne: async ({ where }: any) => ({ ...(await h.orderRow(where.id)), buyer: { id: 9 } }) },
    });
    await svc.buyerConfirmDelivery(w.good, 9);
    await assertReleased(w, w.good, 1000);
    await expect(svc.buyerConfirmDelivery(w.good, 9)).rejects.toBeDefined(); // no longer 'delivered': cannot double-run
    expect(await h.ledgerRows(w.good)).toHaveLength(1);
    await expect(svc.buyerConfirmDelivery(w.blocked, 9)).rejects.toBeInstanceOf(MoneyRoutingBlockedException);
    await assertHeld(w.blocked);
    expect((await h.orderRow(w.blocked)).status).toBe('delivered'); // completion facts were NOT written either
  });

  // ── 2. ShippingService.autoCompleteDelivered (midnight cron) ────────────
  it('ShippingService.autoCompleteDelivered: releases the routable order, holds the blocked one, batch continues, re-run is idempotent', async () => {
    if (!h.reachable) return;
    const w = await world('ShipCron', { status: 'delivered' });
    const svc: any = build(ShippingService, { orderRelease: h.release, orderRepo: { createQueryBuilder: () => qb([{ id: w.blocked }, { id: w.good }]) } });
    await svc.autoCompleteDelivered();
    await assertReleased(w, w.good, 1000);
    await assertHeld(w.blocked);
    await svc.autoCompleteDelivered(); // retry
    expect(await h.ledgerRows(w.good)).toHaveLength(1);
    expect((await h.orderRow(w.good)).paymentStatus).toBe('released');
    expect((await h.orderRow(w.blocked)).status).toBe('delivered');
  });

  // ── 3. DisputesService.resolve (favour seller / buyer / split) ──────────
  const disputeFor = (orderId: number, extra: Record<string, unknown> = {}) => ({
    id: 5, reason: DisputeReason.OTHER ?? 'other', order: { id: orderId, buyer: {}, seller: {}, paymentMethod: 'online' }, arbitrator: null, raisedBy: {}, ...extra,
  });
  const disputes = (dispute: any) => {
    const disputeUpdate = jest.fn();
    const orderUpdate = jest.fn(async (id: number, f: any) => orderRepoStub().update(id, f));
    const svc: any = build(DisputesService, {
      orderRelease: h.release,
      disputeRepo: { findOne: async () => dispute, update: disputeUpdate },
      orderRepo: { update: orderUpdate },
      smsService: { sendSms: async () => undefined },
    });
    return { svc, disputeUpdate, orderUpdate };
  };
  const admin: any = { roleType: AccountRoleType.ADMIN };

  it('DisputesService.resolve FAVOUR_SELLER: canonical release (routed once, released); blocked -> dispute NOT resolved, nothing released', async () => {
    if (!h.reachable) return;
    const w = await world('DisSeller', { status: 'disputed', escrowStatus: 'disputed' });
    const ok = disputes(disputeFor(w.good));
    await ok.svc.resolve({ id: 1 }, 5, { resolution: DisputeResolution.FAVOUR_SELLER, resolutionNote: 'seller wins' }, admin);
    await assertReleased(w, w.good, 1000);
    expect(ok.disputeUpdate).toHaveBeenCalled();
    expect((await h.orderRow(w.good)).status).toBe('completed');
    const bad = disputes(disputeFor(w.blocked));
    await expect(bad.svc.resolve({ id: 1 }, 5, { resolution: DisputeResolution.FAVOUR_SELLER, resolutionNote: 'x' }, admin)).rejects.toBeInstanceOf(MoneyRoutingBlockedException);
    expect(bad.disputeUpdate).not.toHaveBeenCalled();
    expect(bad.orderUpdate).not.toHaveBeenCalled();
    await assertHeld(w.blocked);
    // retry of the winning resolution stays idempotent
    await ok.svc.resolve({ id: 1 }, 5, { resolution: DisputeResolution.FAVOUR_SELLER, resolutionNote: 'seller wins' }, admin);
    expect(await h.ledgerRows(w.good)).toHaveLength(1);
  });

  it('DisputesService.resolve FAVOUR_BUYER is a REFUND: state change only (no wallet movement), and it cancels a not-yet-routed seller-proceeds entry', async () => {
    if (!h.reachable) return;
    const w = await world('DisBuyer', { status: 'disputed', escrowStatus: 'disputed' });
    await expect(h.release.releaseSellerProceeds({ orderId: w.blocked, source: 'DISPUTE_RESOLUTION' })).rejects.toBeInstanceOf(MoneyRoutingBlockedException); // a BLOCKED entry exists
    const d = disputes(disputeFor(w.blocked));
    await d.svc.resolve({ id: 1 }, 5, { resolution: DisputeResolution.FAVOUR_BUYER, resolutionNote: 'buyer wins' }, admin);
    const row = await h.orderRow(w.blocked);
    expect(row).toMatchObject({ escrowStatus: 'refunded', payoutStatus: 'cancelled' });
    expect(await h.ledgerRows(w.blocked)).toHaveLength(0); // no money moved to anyone
    expect((await h.entryOf(w.blocked)).state).toBe('CANCELLED');
    await expect(h.release.releaseSellerProceeds({ orderId: w.blocked, source: 'ADMIN_RELEASE' })).rejects.toMatchObject({ response: { code: 'ORDER_ESCROW_NOT_RELEASABLE' } });
  });

  it('DisputesService.resolve SPLIT never marks escrow released (no computable seller amount): escrow stays DISPUTED for an explicit canonical release', async () => {
    if (!h.reachable) return;
    const w = await world('DisSplit', { status: 'disputed', escrowStatus: 'disputed' });
    const d = disputes(disputeFor(w.good));
    await d.svc.resolve({ id: 1 }, 5, { resolution: DisputeResolution.SPLIT, resolutionNote: 'split' }, admin);
    const row = await h.orderRow(w.good);
    expect(row.escrowStatus).toBe('disputed');
    expect(row.fundsReleasedAt).toBeNull();
    expect(await h.ledgerRows(w.good)).toHaveLength(0);
  });

  // ── 4. PaymentsService.releaseEscrow (admin) ────────────────────────────
  it('PaymentsService.releaseEscrow: canonical release; blocked -> 409 and unreleased; retry safe', async () => {
    if (!h.reachable) return;
    const w = await world('PayRel');
    const svc: any = build(PaymentsService, {
      orderRelease: h.release,
      orderRepo: { findOne: async ({ where }: any) => ({ ...(await h.orderRow(where.id)), seller: { id: w.owner.id }, buyer: {}, product: {} }) },
    });
    await svc.releaseEscrow(w.good, 1);
    await assertReleased(w, w.good, 1000);
    await svc.releaseEscrow(w.good, 1); // retry
    expect(await h.ledgerRows(w.good)).toHaveLength(1);
    await expect(svc.releaseEscrow(w.blocked, 1)).rejects.toBeInstanceOf(MoneyRoutingBlockedException);
    await assertHeld(w.blocked);
  });

  // ── 5. PaymentsService.completeDigitalOrder ─────────────────────────────
  it('PaymentsService.completeDigitalOrder: routable -> completed+released+credited; blocked -> payment recorded, NOT completed/released', async () => {
    if (!h.reachable) return;
    const w = await world('Digital', { status: 'paid', paymentStatus: 'pending' });
    const svc: any = build(PaymentsService, { orderRelease: h.release, orderRepo: orderRepoStub(), logger: { log: () => {}, warn: () => {} } });
    const asOrder = async (id: number) => ({ ...(await h.orderRow(id)), seller: { id: w.owner.id }, buyer: { id: 3 }, product: { name: 'ebook' } });
    await svc.completeDigitalOrder(await asOrder(w.good));
    await assertReleased(w, w.good, 1000);
    expect(await h.orderRow(w.good)).toMatchObject({ paymentStatus: 'paid', status: 'completed' });
    await svc.completeDigitalOrder(await asOrder(w.blocked));
    const held = await h.orderRow(w.blocked);
    expect(held.paymentStatus).toBe('paid'); // the customer's payment is recorded
    expect(held.status).toBe('paid'); // but the order is not completed
    await assertHeld(w.blocked);
  });

  // ── 6. InvoicesService.markPaid (digital) ───────────────────────────────
  it('InvoicesService.markPaid (digital product): canonical release; blocked -> paid-but-held', async () => {
    if (!h.reachable) return;
    const w = await world('InvPaid', { status: 'pending_payment', paymentStatus: 'pending' });
    const mk = (orderId: number) => {
      const invoice: any = { id: 1, invoiceNumber: `INV-${orderId}`, status: 'awaiting_payment', order: { id: orderId, product: { productType: 'digital' }, seller: { id: w.owner.id }, sellerAmount: 1000 }, buyer: { id: 3 } };
      const svc: any = build(InvoicesService, {
        orderRelease: h.release,
        findByInvoiceNumber: async () => invoice,
        generateReceiptNumber: async () => 'R-1',
        invoiceRepo: { save: async (i: any) => i },
        orderRepo: orderRepoStub(),
        logger: { log: () => {}, warn: () => {} },
      });
      return svc;
    };
    await mk(w.good).markPaid(`INV-${w.good}`, 'TX1');
    await assertReleased(w, w.good, 1000);
    await mk(w.blocked).markPaid(`INV-${w.blocked}`, 'TX2'); // does not throw: the payment succeeded
    await assertHeld(w.blocked);
    expect((await h.orderRow(w.blocked)).status).toBe('paid');
  });

  // ── 7. OrdersService: buyerConfirm, confirmViaToken, auto-confirm cron, admin dispute ──
  const orders = (extra: Record<string, unknown> = {}) => build<any>(OrdersService, { orderRelease: h.release, ...extra });
  const asFull = async (id: number, w: any) => ({ ...(await h.orderRow(id)), seller: { id: w.owner.id }, buyer: { id: 9 }, product: { name: 'P' } });

  it('OrdersService.buyerConfirm: routed once + released; blocked -> refused, unreleased; retry safe', async () => {
    if (!h.reachable) return;
    const w = await world('OrdConfirm', { status: 'delivered' });
    const svc = orders({ repo: { findOne: async ({ where }: any) => asFull(where.id, w) }, markClassifiedSoldIfLinked: async () => undefined, updateSellerCompletionStats: async () => undefined });
    await svc.buyerConfirm(w.good, { id: 9 });
    await assertReleased(w, w.good, 1000);
    expect((await h.orderRow(w.good)).status).toBe('completed');
    await expect(svc.buyerConfirm(w.good, { id: 9 })).rejects.toBeDefined(); // already completed: not deliverable again
    expect(await h.ledgerRows(w.good)).toHaveLength(1);
    await expect(svc.buyerConfirm(w.blocked, { id: 9 })).rejects.toBeInstanceOf(MoneyRoutingBlockedException);
    await assertHeld(w.blocked);
    expect((await h.orderRow(w.blocked)).status).toBe('delivered');
  });

  it('OrdersService.confirmViaToken (online): routed once + released with the rating facts; blocked -> refused, unreleased; token reuse safe', async () => {
    if (!h.reachable) return;
    const w = await world('OrdToken', { status: 'delivered' });
    await h.q(`UPDATE "order" SET "confirmationToken" = 'tok-good' WHERE id = $1`, [w.good]);
    await h.q(`UPDATE "order" SET "confirmationToken" = 'tok-blk' WHERE id = $1`, [w.blocked]);
    const svc = orders({
      repo: { findOne: async ({ where }: any) => { const id = where.confirmationToken === 'tok-good' ? w.good : w.blocked; return { ...(await asFull(id, w)), source: 'online' }; } },
      resolveShippingParties: async () => ({ superAgent: null, transportProvider: null }),
      markClassifiedSoldIfLinked: async () => undefined, syncParcelDeliveredForOrder: async () => undefined, updateSellerCompletionStats: async () => undefined,
    });
    await svc.confirmViaToken('tok-good', { confirmed: true, rating: 5, review: 'great' });
    await assertReleased(w, w.good, 1000);
    expect(await h.orderRow(w.good)).toMatchObject({ status: 'completed', buyerRating: 5, buyerReview: 'great', confirmationToken: null });
    await expect(svc.confirmViaToken('tok-blk', { confirmed: true, rating: 4 })).rejects.toBeInstanceOf(MoneyRoutingBlockedException);
    await assertHeld(w.blocked);
    expect((await h.orderRow(w.blocked)).confirmationToken).toBe('tok-blk'); // the token is NOT burned by a failed release
  });

  it('OrdersService.autoConfirmDeliveredOrders (cron): releases the routable order, holds the blocked one, re-run idempotent', async () => {
    if (!h.reachable) return;
    const old = new Date(Date.now() - 10 * 86400000);
    const w = await world('OrdCron', { status: 'delivered', deliveredAt: old });
    const svc = orders({
      repo: { find: async () => [await asFull(w.blocked, w), await asFull(w.good, w)] },
      markClassifiedSoldIfLinked: async () => undefined, syncParcelDeliveredForOrder: async () => undefined, updateSellerCompletionStats: async () => undefined,
    });
    await (svc as any).autoConfirmDeliveredOrders();
    await assertReleased(w, w.good, 1000);
    await assertHeld(w.blocked);
    await (svc as any).autoConfirmDeliveredOrders();
    expect(await h.ledgerRows(w.good)).toHaveLength(1);
    expect((await h.orderRow(w.blocked)).status).toBe('delivered');
  });

  it('OrdersService.resolveDispute: seller favour = canonical release; buyer favour = refund state only + cancels an unrouted entry', async () => {
    if (!h.reachable) return;
    const w = await world('OrdDispute', { status: 'disputed', escrowStatus: 'disputed' });
    const svc = orders({
      repo: { findOne: async ({ where }: any) => asFull(where.id, w), ...orderRepoStub() },
      markClassifiedSoldIfLinked: async () => undefined, updateSellerCompletionStats: async () => undefined,
    });
    await svc.resolveDispute(w.good, { id: 1 }, { resolution: 'ok', favour: 'seller' });
    await assertReleased(w, w.good, 1000);
    expect((await h.orderRow(w.good)).status).toBe('completed');
    await svc.resolveDispute(w.good, { id: 1 }, { resolution: 'ok', favour: 'seller' }).catch(() => undefined);
    expect(await h.ledgerRows(w.good)).toHaveLength(1);
    await expect(svc.resolveDispute(w.blocked, { id: 1 }, { resolution: 'ok', favour: 'seller' })).rejects.toBeInstanceOf(MoneyRoutingBlockedException);
    await assertHeld(w.blocked);
    await svc.resolveDispute(w.blocked, { id: 1 }, { resolution: 'refund', favour: 'buyer' });
    expect(await h.orderRow(w.blocked)).toMatchObject({ escrowStatus: 'refunded', payoutStatus: 'refunded', status: 'cancelled' });
    expect((await h.entryOf(w.blocked)).state).toBe('CANCELLED');
    expect(await h.ledgerRows(w.blocked)).toHaveLength(0);
  });

  // ── 8. DailyBatchesService.autoReleaseEscrow (cron) ─────────────────────
  it('DailyBatchesService.autoReleaseEscrow (cron): releases the routable order, holds the blocked one, re-run idempotent', async () => {
    if (!h.reachable) return;
    const w = await world('Batch', { status: 'delivered', autoReleaseAt: new Date(Date.now() - 3600_000) });
    const svc: any = build(DailyBatchesService, {
      orderRelease: h.release,
      orderRepo: { createQueryBuilder: () => qb([{ ...(await0(w.blocked)), seller: {}, buyer: {} }, { ...(await0(w.good)), seller: {}, buyer: {} }]) },
    });
    function await0(id: number) { return { id, sellerAmount: 0 }; }
    await svc.autoReleaseEscrow();
    await assertReleased(w, w.good, 1000);
    await assertHeld(w.blocked);
    await svc.autoReleaseEscrow();
    expect(await h.ledgerRows(w.good)).toHaveLength(1);
    expect((await h.orderRow(w.good)).autoConfirmAt).toBeTruthy();
  });
});
