import { ConflictException } from '@nestjs/common';
import { ReleaseHarness, setupReleaseHarness } from './i2g-release-harness';
import { MoneyRoutingBlockedException } from './order-routing-target';

/**
 * The canonical seller-release operation, against real Postgres and the real I2G migrations:
 *   ORDER LOCK -> RELEASE GUARD -> ORDER:<id>:SELLER_PROCEEDS -> idempotent routing -> RELEASE STATE
 * committed atomically; BLOCKED routing fails closed with nothing released or credited.
 */
describe('I2G canonical order release (real disposable-DB)', () => {
  let h: ReleaseHarness;
  beforeAll(async () => { h = await setupReleaseHarness(); }, 120000);
  afterAll(async () => { if (h?.reachable) await h.destroy(); });
  afterEach(() => { delete process.env.OWNERSHIP_FLAG_RELEASE_GUARD_ENFORCE; jest.restoreAllMocks(); });

  it('§0 disposable database reachable', () => expect(h.reachable).toBe(true));

  it('success: proceeds are routed to the Business wallet ONCE and the release state + completion facts commit with it', async () => {
    if (!h.reachable) return;
    const owner = await h.makeUser('Own');
    const A = await h.makeBusiness(owner, 'A', { selling: true });
    const o = await h.makeOrder({ sellerId: owner.id, workspaceId: A.workspace.id, sellerAmount: 1500 });
    const out = await h.release.releaseSellerProceeds({ orderId: o, source: 'ESCROW_RELEASE', orderUpdate: { status: 'completed', completedAt: new Date(), buyerReview: 'ok' } });
    expect(out).toMatchObject({ released: true, alreadyReleased: false });
    const row = await h.orderRow(o);
    expect(row).toMatchObject({ escrowStatus: 'released', payoutStatus: 'released', status: 'completed', buyerReview: 'ok' });
    expect(row.fundsReleasedAt).toBeTruthy();
    const wA = await h.wallets.getOrCreateBusinessWallet(A.workspace.id);
    expect(await h.balanceOf(wA.id)).toBe(1500);
    expect(await h.ledgerRows(o)).toHaveLength(1);
    expect((await h.entryOf(o)).eventKey).toBe(`ORDER:${o}:SELLER_PROCEEDS`);
  });

  it('BLOCKED (order unstamped, Product stamped): wallet untouched, escrow NOT released, no companion fields written, stable reason + identifiers thrown', async () => {
    if (!h.reachable) return;
    const owner = await h.makeUser('Blk');
    const A = await h.makeBusiness(owner, 'BA', { selling: true });
    const product = await h.makeProduct(owner.id, A.workspace.id);
    const o = await h.makeOrder({ sellerId: owner.id, productId: product, workspaceId: null, sellerAmount: 900 });
    const wallets0 = Number((await h.q(`SELECT count(*)::int n FROM wallet`))[0].n);
    const err: any = await h.release.releaseSellerProceeds({ orderId: o, source: 'ESCROW_RELEASE', orderUpdate: { status: 'completed' } }).catch((e) => e);
    expect(err).toBeInstanceOf(MoneyRoutingBlockedException);
    expect(err.response).toMatchObject({ code: 'MONEY_ROUTING_BLOCKED', reason: 'PARENT_STAMPED_ORDER_UNSTAMPED', detail: { orderId: o, sellerId: owner.id, productId: product, productWorkspaceId: A.workspace.id } });
    const row = await h.orderRow(o);
    expect(row).toMatchObject({ escrowStatus: 'holding', status: 'delivered' });
    expect(row.fundsReleasedAt).toBeNull();
    expect(row.payoutStatus).toBeNull();
    expect(Number((await h.q(`SELECT count(*)::int n FROM wallet`))[0].n)).toBe(wallets0); // not even a Personal wallet is created
    expect(await h.ledgerRows(o)).toHaveLength(0);
    expect(await h.entryOf(o)).toMatchObject({ state: 'BLOCKED', blockReason: 'PARENT_STAMPED_ORDER_UNSTAMPED' });
  });

  it('BLOCKED (legacy order of an owner with an active Selling Business is ambiguous): unreleased, nothing credited', async () => {
    if (!h.reachable) return;
    const owner = await h.makeUser('Amb');
    await h.makeBusiness(owner, 'AmbA', { selling: true });
    const o = await h.makeOrder({ sellerId: owner.id, workspaceId: null, sellerAmount: 400, source: 'online' });
    await expect(h.release.releaseSellerProceeds({ orderId: o, source: 'AUTO_RELEASE' })).rejects.toMatchObject({ response: { reason: 'AMBIGUOUS_LEGACY_OWNER' } });
    expect((await h.orderRow(o)).escrowStatus).toBe('holding');
    expect(await h.ledgerRows(o)).toHaveLength(0);
  });

  it('retry/idempotency: sequential and concurrent releases credit once and converge on released', async () => {
    if (!h.reachable) return;
    const owner = await h.makeUser('Idem');
    const A = await h.makeBusiness(owner, 'IdemA', { selling: true });
    const o = await h.makeOrder({ sellerId: owner.id, workspaceId: A.workspace.id, sellerAmount: 700 });
    const results = await Promise.allSettled([1, 2, 3, 4, 5].map((i) => h.release.releaseSellerProceeds({ orderId: o, source: (['ESCROW_RELEASE', 'WEBHOOK_SETTLEMENT', 'AUTO_RELEASE', 'ADMIN_RELEASE', 'DISPUTE_RESOLUTION'] as const)[i - 1] })));
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
    expect((results as any[]).filter((r) => r.value.alreadyReleased === false)).toHaveLength(1);
    const again = await h.release.releaseSellerProceeds({ orderId: o, source: 'ESCROW_RELEASE' });
    expect(again).toMatchObject({ released: true, alreadyReleased: true });
    const wA = await h.wallets.getOrCreateBusinessWallet(A.workspace.id);
    expect(await h.balanceOf(wA.id)).toBe(700);
    expect(await h.ledgerRows(o)).toHaveLength(1);
    expect((await h.orderRow(o)).escrowStatus).toBe('released');
  });

  it('an event already ROUTED by another trigger (e.g. COD delivery) converges: released without a second credit', async () => {
    if (!h.reachable) return;
    const owner = await h.makeUser('Conv');
    const A = await h.makeBusiness(owner, 'ConvA', { selling: true });
    const o = await h.makeOrder({ sellerId: owner.id, workspaceId: A.workspace.id, sellerAmount: 1000 });
    await h.routing.creditSellerProceeds({ orderId: o, amount: 1000, source: 'COD_DELIVERY' });
    expect((await h.orderRow(o)).escrowStatus).toBe('holding');
    const out = await h.release.releaseSellerProceeds({ orderId: o, source: 'ESCROW_RELEASE' });
    expect(out.alreadyReleased).toBe(false);
    expect((await h.orderRow(o)).escrowStatus).toBe('released');
    expect(await h.ledgerRows(o)).toHaveLength(1);
    expect(await h.balanceOf((await h.wallets.getOrCreateBusinessWallet(A.workspace.id)).id)).toBe(1000);
  });

  it('a different amount for the same event blocks the release (no credit, not released)', async () => {
    if (!h.reachable) return;
    const owner = await h.makeUser('Amt');
    const A = await h.makeBusiness(owner, 'AmtA', { selling: true });
    const o = await h.makeOrder({ sellerId: owner.id, workspaceId: A.workspace.id, sellerAmount: 500 });
    await h.q(`INSERT INTO money_routing_entry ("eventKey","eventType","orderId",amount,"targetType","targetWorkspaceId",state) VALUES ($1,'SELLER_PROCEEDS',$2,300,'BUSINESS_WORKSPACE',$3,'PENDING')`, [`ORDER:${o}:SELLER_PROCEEDS`, o, A.workspace.id]);
    await expect(h.release.releaseSellerProceeds({ orderId: o, source: 'ESCROW_RELEASE' })).rejects.toMatchObject({ response: { reason: 'AMOUNT_CONFLICT' } });
    expect((await h.orderRow(o)).escrowStatus).toBe('holding');
    expect(await h.ledgerRows(o)).toHaveLength(0);
  });

  it('atomicity: a failure AFTER routing rolls the credit back (no credit without release, no release without credit)', async () => {
    if (!h.reachable) return;
    const owner = await h.makeUser('Atom');
    const A = await h.makeBusiness(owner, 'AtomA', { selling: true });
    const o = await h.makeOrder({ sellerId: owner.id, workspaceId: A.workspace.id, sellerAmount: 800 });
    await expect(h.release.releaseSellerProceeds({ orderId: o, source: 'ESCROW_RELEASE', orderUpdate: { buyerRating: 'not-a-number' as any } })).rejects.toThrow();
    expect((await h.orderRow(o)).escrowStatus).toBe('holding');
    expect(await h.ledgerRows(o)).toHaveLength(0);
    expect(await h.balanceOf((await h.wallets.getOrCreateBusinessWallet(A.workspace.id)).id)).toBe(0);
    expect(await h.entryOf(o)).toBeUndefined(); // the entry rolled back with the transaction
    // and a clean retry then succeeds exactly once
    await h.release.releaseSellerProceeds({ orderId: o, source: 'ESCROW_RELEASE' });
    expect(await h.ledgerRows(o)).toHaveLength(1);
  });

  it('same-owner Business isolation: A\'s order credits A only; B\'s order credits B only; Personal untouched; A never credits B', async () => {
    if (!h.reachable) return;
    const owner = await h.makeUser('Iso');
    const A = await h.makeBusiness(owner, 'IsoA', { selling: true });
    const B = await h.makeBusiness(owner, 'IsoB', { selling: true });
    const personal = await h.wallets.getOrCreatePersonalWallet(owner.id);
    const oA = await h.makeOrder({ sellerId: owner.id, workspaceId: A.workspace.id, sellerAmount: 111 });
    const oB = await h.makeOrder({ sellerId: owner.id, workspaceId: B.workspace.id, sellerAmount: 222 });
    await h.release.releaseSellerProceeds({ orderId: oA, source: 'ESCROW_RELEASE' });
    expect(await h.balanceOf((await h.wallets.getOrCreateBusinessWallet(A.workspace.id)).id)).toBe(111);
    expect(await h.balanceOf((await h.wallets.getOrCreateBusinessWallet(B.workspace.id)).id)).toBe(0);
    await h.release.releaseSellerProceeds({ orderId: oB, source: 'ESCROW_RELEASE' });
    expect(await h.balanceOf((await h.wallets.getOrCreateBusinessWallet(B.workspace.id)).id)).toBe(222);
    expect(await h.balanceOf(personal.id)).toBe(0);
    expect((await h.entryOf(oA)).targetWorkspaceId).toBe(A.workspace.id);
    expect((await h.entryOf(oB)).targetWorkspaceId).toBe(B.workspace.id);
  });

  it('legacy Personal seller (no Selling Business) is released to the Personal wallet explicitly, once', async () => {
    if (!h.reachable) return;
    const seller = await h.makeUser('Leg');
    const o = await h.makeOrder({ sellerId: seller.id, workspaceId: null, sellerAmount: 350 });
    await h.release.releaseSellerProceeds({ orderId: o, source: 'ESCROW_RELEASE' });
    await h.release.releaseSellerProceeds({ orderId: o, source: 'ESCROW_RELEASE' });
    expect(await h.balanceOf((await h.wallets.getOrCreatePersonalWallet(seller.id)).id)).toBe(350);
    expect(await h.ledgerRows(o)).toHaveLength(1);
  });

  it('nothing owed (zero amount) or no seller (hub side) releases without a routing entry', async () => {
    if (!h.reachable) return;
    const seller = await h.makeUser('Zero');
    const zero = await h.makeOrder({ sellerId: seller.id, source: 'seller_shipment', sellerAmount: 0, escrowStatus: null });
    const hub = await h.makeOrder({ sellerId: null, source: 'offline_intercity', sellerAmount: 0, escrowStatus: null });
    await h.release.releaseSellerProceeds({ orderId: zero, source: 'AUTO_RELEASE', orderUpdate: { status: 'completed' } });
    await h.release.releaseSellerProceeds({ orderId: hub, source: 'AUTO_RELEASE', orderUpdate: { status: 'completed' } });
    expect((await h.orderRow(zero)).escrowStatus).toBe('released');
    expect((await h.orderRow(hub)).escrowStatus).toBe('released');
    expect(await h.entryOf(zero)).toBeUndefined();
    expect(await h.entryOf(hub)).toBeUndefined();
  });

  it('refunds are NOT seller proceeds: a refunded escrow cannot be released; a buyer refund cancels a not-yet-routed entry; a ROUTED credit is untouched', async () => {
    if (!h.reachable) return;
    const owner = await h.makeUser('Ref');
    const A = await h.makeBusiness(owner, 'RefA', { selling: true });
    const product = await h.makeProduct(owner.id, A.workspace.id);
    // (1) refunded escrow can never be released
    const refunded = await h.makeOrder({ sellerId: owner.id, workspaceId: A.workspace.id, escrowStatus: 'refunded' });
    await expect(h.release.releaseSellerProceeds({ orderId: refunded, source: 'ADMIN_RELEASE' })).rejects.toMatchObject({ response: { code: 'ORDER_ESCROW_NOT_RELEASABLE' } });
    // (2) a BLOCKED entry is cancelled by the refund, and a later release attempt is refused
    const blocked = await h.makeOrder({ sellerId: owner.id, productId: product, workspaceId: null, escrowStatus: 'disputed' });
    await expect(h.release.releaseSellerProceeds({ orderId: blocked, source: 'DISPUTE_RESOLUTION' })).rejects.toBeInstanceOf(MoneyRoutingBlockedException);
    await h.release.recordBuyerRefund(blocked, 'dispute resolved in favour of buyer');
    expect((await h.entryOf(blocked)).state).toBe('CANCELLED');
    await h.q(`UPDATE "order" SET "workspaceId" = $2 WHERE id = $1`, [blocked, A.workspace.id]); // even if ownership is later "fixed"
    await expect(h.release.releaseSellerProceeds({ orderId: blocked, source: 'ADMIN_RELEASE' })).rejects.toMatchObject({ response: { code: 'ORDER_SELLER_PROCEEDS_CANCELLED' } });
    expect(await h.ledgerRows(blocked)).toHaveLength(0);
    // (3) an already-ROUTED credit is never reversed by recordBuyerRefund
    const routedOrder = await h.makeOrder({ sellerId: owner.id, workspaceId: A.workspace.id, sellerAmount: 60 });
    await h.release.releaseSellerProceeds({ orderId: routedOrder, source: 'ESCROW_RELEASE' });
    await h.release.recordBuyerRefund(routedOrder, 'late refund');
    expect((await h.entryOf(routedOrder)).state).toBe('ROUTED');
    expect(await h.ledgerRows(routedOrder)).toHaveLength(1);
  });

  it('only allow-listed companion columns can accompany a release; a foreign column is refused before anything is written', async () => {
    if (!h.reachable) return;
    const owner = await h.makeUser('Col');
    const A = await h.makeBusiness(owner, 'ColA', { selling: true });
    const o = await h.makeOrder({ sellerId: owner.id, workspaceId: A.workspace.id });
    await expect(h.release.releaseSellerProceeds({ orderId: o, source: 'ESCROW_RELEASE', orderUpdate: { sellerAmount: 999999 } })).rejects.toMatchObject({ response: { code: 'RELEASE_COLUMN_NOT_ALLOWED' } });
    await expect(h.release.releaseSellerProceeds({ orderId: o, source: 'ESCROW_RELEASE', orderUpdate: { '"; DROP TABLE wallet; --': 1 } })).rejects.toBeInstanceOf(ConflictException);
    expect((await h.orderRow(o)).escrowStatus).toBe('holding');
  });

  it('an unknown order is NotFound', async () => {
    if (!h.reachable) return;
    await expect(h.release.releaseSellerProceeds({ orderId: 987654321, source: 'ESCROW_RELEASE' })).rejects.toMatchObject({ status: 404 });
  });

  // ── ABSOLUTE INVARIANT: released <=> canonical SELLER_PROCEEDS event ROUTED (+ exactly one credit) ──
  const assertInvariant = async (orderId: number, amount: number) => {
    const row = await h.orderRow(orderId);
    expect(row.escrowStatus).toBe('released');
    expect(row.payoutStatus).toBe('released');
    expect(row.fundsReleasedAt).toBeTruthy();
    const entries = await h.q(`SELECT state, "eventKey", "eventType" FROM money_routing_entry WHERE "orderId" = $1`, [orderId]);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ eventKey: `ORDER:${orderId}:SELLER_PROCEEDS`, eventType: 'SELLER_PROCEEDS', state: 'ROUTED' });
    const ledger = await h.ledgerRows(orderId);
    expect(ledger).toHaveLength(1);
    expect(Number(ledger[0].amount)).toBe(amount);
  };

  for (const state of ['unset', 'true', 'false'] as const) {
    it(`OWNERSHIP_FLAG_RELEASE_GUARD_ENFORCE=${state}: no state can release without routing (routable order routed once; blocked order held)`, async () => {
      if (!h.reachable) return;
      if (state === 'unset') delete process.env.OWNERSHIP_FLAG_RELEASE_GUARD_ENFORCE;
      else process.env.OWNERSHIP_FLAG_RELEASE_GUARD_ENFORCE = state;
      const owner = await h.makeUser(`Inv${state}`);
      const A = await h.makeBusiness(owner, `Inv${state}A`, { selling: true });
      const product = await h.makeProduct(owner.id, A.workspace.id);
      const good = await h.makeOrder({ sellerId: owner.id, workspaceId: A.workspace.id, sellerAmount: 250 });
      const bad = await h.makeOrder({ sellerId: owner.id, productId: product, workspaceId: null, sellerAmount: 90 });
      await h.release.releaseSellerProceeds({ orderId: good, source: 'ESCROW_RELEASE' });
      await assertInvariant(good, 250);
      await expect(h.release.releaseSellerProceeds({ orderId: bad, source: 'ESCROW_RELEASE' })).rejects.toBeInstanceOf(MoneyRoutingBlockedException);
      const row = await h.orderRow(bad);
      expect(row.escrowStatus).toBe('holding');
      expect(row.payoutStatus).not.toBe('released');
      expect(row.fundsReleasedAt).toBeNull();
      expect(await h.ledgerRows(bad)).toHaveLength(0);
      expect(await h.entryOf(bad)).toMatchObject({ state: 'BLOCKED' });
    });
  }

  it('retry: releasing twice leaves one routing entry, one wallet credit and a converged released state', async () => {
    if (!h.reachable) return;
    const owner = await h.makeUser('InvRetry');
    const A = await h.makeBusiness(owner, 'InvRetryA', { selling: true });
    const o = await h.makeOrder({ sellerId: owner.id, workspaceId: A.workspace.id, sellerAmount: 400 });
    const first = await h.release.releaseSellerProceeds({ orderId: o, source: 'ESCROW_RELEASE' });
    const second = await h.release.releaseSellerProceeds({ orderId: o, source: 'ADMIN_RELEASE' });
    expect(first.alreadyReleased).toBe(false);
    expect(second.alreadyReleased).toBe(true);
    await assertInvariant(o, 400);
    expect(await h.balanceOf((await h.wallets.getOrCreateBusinessWallet(A.workspace.id)).id)).toBe(400);
  });

  it('nothing-owed cases (no seller / amount <= 0) release without an entry; a seller order with proceeds never does', async () => {
    if (!h.reachable) return;
    const owner = await h.makeUser('InvNone');
    const A = await h.makeBusiness(owner, 'InvNoneA', { selling: true });
    const zero = await h.makeOrder({ sellerId: owner.id, workspaceId: A.workspace.id, sellerAmount: 0 });
    await h.release.releaseSellerProceeds({ orderId: zero, source: 'ESCROW_RELEASE' });
    expect((await h.orderRow(zero)).escrowStatus).toBe('released');
    expect(await h.entryOf(zero)).toBeFalsy();
    const rows = await h.q(`SELECT id FROM "order" o WHERE o."escrowStatus" = 'released' AND o."sellerId" IS NOT NULL AND o."sellerAmount" > 0
        AND NOT EXISTS (SELECT 1 FROM money_routing_entry e WHERE e."orderId" = o.id AND e."eventKey" = 'ORDER:' || o.id || ':SELLER_PROCEEDS' AND e.state = 'ROUTED')`);
    expect(rows).toHaveLength(0); // GLOBAL invariant over every order this whole spec released
  });
});
