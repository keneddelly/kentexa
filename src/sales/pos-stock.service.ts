import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InventoryService } from '../inventory/inventory.service';
import { InventoryMovementReason } from '../inventory/entities/inventory-movement.entity';
import { ownershipFlag } from '../ownership/ownership-feature-flags.service';
import type { SellerScope } from '../business/seller-scope.service';

/**
 * POS part 3 (owner approved 2026-11-03, design "KenteXa POS ya kisasa", boards "Stoo" and
 * "Madeni"):
 *   Stoo     Pokea mzigo (goods from a supplier: stock up, cost price kept, "not paid yet" makes
 *            a supplier debt), Hesabu stoo (the real count; the difference is saved with a
 *            reason), Zinakaribia kuisha (running low).
 *   Madeni   customers who owe (POS credit sales with a balance), "Pokea malipo" pays the
 *            oldest first; suppliers the shop owes, "Lipa". Reminders go from the shop's own
 *            WhatsApp/SMS in the browser (owner choice), never KenteXa SMS.
 * Stock changes only through InventoryService (one stock for the till and the online shop).
 * Before migration 1794900000000 everything here is off.
 */
export const POS_STOCK_TEXT = {
  notReady: 'Stoo na madeni bado havijawashwa.',
  noItems: 'Ongeza angalau bidhaa moja.',
  badItem: 'Bidhaa moja si yako au idadi si sahihi.',
  badAmount: 'Andika kiasi sahihi.',
  tooMuch: 'Kiasi kinazidi deni lake.',
  noDebt: 'Mteja huyu hana deni.',
  noSupplier: 'Msambazaji hapatikani.',
  reasonShort: 'Eleza sababu ya tofauti (angalau herufi 3).',
} as const;

const METHODS = ['cash', 'mpesa', 'tigo_pesa', 'airtel_money', 'halopesa', 'bank', 'other'];
const digits = (v: unknown) => String(v ?? '').replace(/[^0-9]/g, '');
/** One customer = same phone (last 9 digits), or the same name when there is no phone. */
export const customerKey = (phone: unknown, name: unknown) => {
  const d = digits(phone).slice(-9);
  return d.length === 9 ? `p:${d}` : `n:${String(name ?? '').trim().toLowerCase()}`;
};

@Injectable()
export class PosStockService {
  private ready = false;
  private checkedAt = 0;

  constructor(private readonly db: DataSource, private readonly inventory: InventoryService) {}

  async tablesReady(): Promise<boolean> {
    if (!this.ready && Date.now() - this.checkedAt > 60_000) {
      this.checkedAt = Date.now();
      try {
        const [r] = await this.db.query(`SELECT to_regclass('public.pos_debt_payment') IS NOT NULL AS ok`);
        this.ready = Boolean(r?.ok);
      } catch { this.ready = false; }
    }
    return this.ready;
  }
  private async need() { if (!(await this.tablesReady())) throw new BadRequestException(POS_STOCK_TEXT.notReady); }

  private ws(scope: SellerScope | undefined, alias: string, params: any[]): string {
    if (!scope || (scope as any).delegated || !ownershipFlag('SALE_WORKSPACE_ENFORCE')) return '';
    if (scope.workspaceId == null) return ` AND ${alias}."workspaceId" IS NULL`;
    params.push(scope.workspaceId);
    return ` AND ${alias}."workspaceId" = $${params.length}::int`;
  }

  // ── Stoo ──────────────────────────────────────────────────────────────
  async stock(sellerId: number) {
    const low: any[] = await this.db.query(`
      SELECT p.id, p.name, p.stock, p."minStockThreshold" AS min,
             COALESCE((SELECT SUM(i.quantity) FROM public.sale_item i JOIN public.sale s ON s.id = i."saleId"
                        WHERE i."productId" = p.id AND s.status = 'completed' AND s."createdAt" > now() - interval '7 days'), 0)::int AS "sold7"
        FROM public.product p
       WHERE p."sellerId" = $1::int AND p."isActive" = true
         AND p.stock <= GREATEST(COALESCE(p."minStockThreshold", 0), 3)
       ORDER BY p.stock ASC, p.name ASC LIMIT 50`, [sellerId]);
    const suppliers = (await this.tablesReady())
      ? await this.db.query(`SELECT id, name, phone FROM public.pos_supplier WHERE "sellerId" = $1::int ORDER BY name ASC LIMIT 200`, [sellerId])
      : [];
    return {
      ready: await this.tablesReady(),
      low: low.map((r) => ({ id: Number(r.id), name: r.name, stock: Number(r.stock), sold7: Number(r.sold7) })),
      suppliers: suppliers.map((s: any) => ({ id: Number(s.id), name: s.name, phone: s.phone })),
    };
  }

  /** The seller's own products among these ids (anything else is refused). */
  private async ownProducts(sellerId: number, ids: number[]) {
    const rows: any[] = await this.db.query(`SELECT id, name, stock FROM public.product WHERE "sellerId" = $1::int AND id = ANY($2::int[])`, [sellerId, ids]);
    const map = new Map(rows.map((r) => [Number(r.id), r]));
    if (ids.some((id) => !map.has(id))) throw new BadRequestException(POS_STOCK_TEXT.badItem);
    return map;
  }

  private async supplierId(sellerId: number, scope: SellerScope | undefined, name: unknown, phone: unknown): Promise<number | null> {
    const n = String(name ?? '').trim().slice(0, 120);
    if (!n) return null;
    const ph = digits(phone).slice(0, 30) || null;
    const [row] = await this.db.query(`
      INSERT INTO public.pos_supplier ("sellerId", "workspaceId", name, phone) VALUES ($1::int, $2::int, $3::varchar, $4::varchar)
      ON CONFLICT ("sellerId", lower(name)) DO UPDATE SET phone = COALESCE(EXCLUDED.phone, public.pos_supplier.phone)
      RETURNING id`, [sellerId, scope?.workspaceId ?? null, n, ph]);
    return Number(row.id);
  }

  async receive(sellerId: number, userId: number, body: any, scope?: SellerScope) {
    await this.need();
    const items = (Array.isArray(body?.items) ? body.items : []).map((i: any) => ({
      productId: Number(i?.productId), qty: Math.round(Number(i?.qty)), unitCost: Math.round(Number(i?.unitCost) || 0),
    }));
    if (!items.length) throw new BadRequestException(POS_STOCK_TEXT.noItems);
    if (items.length > 100 || items.some((i: any) => !Number.isInteger(i.productId) || i.productId <= 0 || !(i.qty > 0) || i.qty > 1_000_000 || i.unitCost < 0)) {
      throw new BadRequestException(POS_STOCK_TEXT.badItem);
    }
    const own = await this.ownProducts(sellerId, [...new Set<number>(items.map((i: any) => i.productId))]);
    const supplierId = await this.supplierId(sellerId, scope, body?.supplierName, body?.supplierPhone);
    const unpaid = !!body?.unpaid && supplierId != null;
    const note = typeof body?.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 200) : null;
    for (const i of items) {
      await this.inventory.adjustStock(i.productId, i.qty, InventoryMovementReason.PURCHASE, { userId, note: note || 'Pokea mzigo (POS)' });
      if (i.unitCost > 0) await this.db.query(`UPDATE public.product SET "costPrice" = $2::numeric WHERE id = $1::int`, [i.productId, i.unitCost]);
    }
    const total = items.reduce((s: number, i: any) => s + i.qty * i.unitCost, 0);
    const lines = items.map((i: any) => ({ ...i, name: own.get(i.productId)?.name ?? null }));
    const [row] = await this.db.query(`
      INSERT INTO public.pos_stock_receipt ("sellerId", "workspaceId", "supplierId", items, total, unpaid, note, "createdByUserId")
      VALUES ($1::int, $2::int, $3::int, $4::jsonb, $5::numeric, $6::boolean, $7::varchar, $8::int) RETURNING id`,
      [sellerId, scope?.workspaceId ?? null, supplierId, JSON.stringify(lines), total, unpaid, note, userId]);
    return { id: Number(row.id), total, unpaid, items: lines.length };
  }

  async count(sellerId: number, userId: number, body: any) {
    await this.need();
    const reason = String(body?.reason ?? '').trim().slice(0, 150);
    const items = (Array.isArray(body?.items) ? body.items : []).map((i: any) => ({ productId: Number(i?.productId), counted: Math.round(Number(i?.counted)) }));
    if (!items.length) throw new BadRequestException(POS_STOCK_TEXT.noItems);
    if (items.length > 300 || items.some((i: any) => !Number.isInteger(i.productId) || !(i.counted >= 0) || i.counted > 10_000_000)) throw new BadRequestException(POS_STOCK_TEXT.badItem);
    const own = await this.ownProducts(sellerId, [...new Set<number>(items.map((i: any) => i.productId))]);
    const changes = items.map((i: any) => ({ productId: i.productId, name: own.get(i.productId).name, before: Number(own.get(i.productId).stock), after: i.counted }))
      .filter((c: any) => c.after !== c.before);
    if (changes.length && reason.length < 3) throw new BadRequestException(POS_STOCK_TEXT.reasonShort);
    for (const c of changes) {
      await this.inventory.adjustStock(c.productId, c.after - c.before, InventoryMovementReason.ADJUSTMENT, { userId, note: `Hesabu stoo: ${reason}` });
    }
    return { changed: changes.length, changes };
  }

  // ── Madeni ────────────────────────────────────────────────────────────
  private async creditSales(sellerId: number, scope?: SellerScope) {
    const params: any[] = [sellerId];
    const w = this.ws(scope, 's', params);
    const rows: any[] = await this.db.query(`
      SELECT s.id, s."receiptNumber", s."customerName", s."customerPhone", s."balanceDue", s.total, COALESCE(s."soldAt", s."createdAt") AS at
        FROM public.sale s
       WHERE s."sellerId" = $1::int AND s.status = 'completed' AND s."creditSale" = true AND s."balanceDue" > 0${w}
       ORDER BY COALESCE(s."soldAt", s."createdAt") ASC, s.id ASC`, params);
    return rows.map((r) => ({ ...r, id: Number(r.id), balanceDue: Number(r.balanceDue), total: Number(r.total) }));
  }

  async debts(sellerId: number, scope?: SellerScope) {
    if (!(await this.tablesReady())) return { ready: false, customers: [], suppliers: [], customerTotal: 0, supplierTotal: 0 };
    const sales = await this.creditSales(sellerId, scope);
    const groups = new Map<string, any>();
    for (const s of sales) {
      const key = customerKey(s.customerPhone, s.customerName);
      const g = groups.get(key) || { key, name: s.customerName || 'Mteja', phone: s.customerPhone || null, owed: 0, sales: [] as any[], since: s.at };
      g.owed += s.balanceDue;
      g.sales.push({ id: s.id, receiptNumber: s.receiptNumber, at: s.at, balanceDue: s.balanceDue, total: s.total });
      groups.set(key, g);
    }
    const customers = [...groups.values()].sort((a, b) => b.owed - a.owed);
    const suppliers: any[] = await this.db.query(`
      SELECT sp.id, sp.name, sp.phone,
             COALESCE((SELECT SUM(total) FROM public.pos_stock_receipt r WHERE r."supplierId" = sp.id AND r.unpaid = true), 0)
           - COALESCE((SELECT SUM(amount) FROM public.pos_debt_payment p WHERE p."supplierId" = sp.id AND p.kind = 'supplier'), 0) AS owed
        FROM public.pos_supplier sp WHERE sp."sellerId" = $1::int`, [sellerId]);
    const owing = suppliers.map((s) => ({ id: Number(s.id), name: s.name, phone: s.phone, owed: Math.max(0, Math.round(Number(s.owed))) })).filter((s) => s.owed > 0)
      .sort((a, b) => b.owed - a.owed);
    return {
      ready: true,
      customers, customerTotal: customers.reduce((t, c) => t + c.owed, 0),
      suppliers: owing, supplierTotal: owing.reduce((t, s) => t + s.owed, 0),
    };
  }

  /** "Pokea malipo": the customer's payment goes to their oldest unpaid receipts first. */
  async payCustomer(sellerId: number, userId: number, body: any, scope?: SellerScope) {
    await this.need();
    const amount = Math.round(Number(body?.amount));
    const method = METHODS.includes(String(body?.method)) ? String(body.method) : 'cash';
    if (!Number.isFinite(amount) || amount <= 0) throw new BadRequestException(POS_STOCK_TEXT.badAmount);
    const sales = (await this.creditSales(sellerId, scope)).filter((s) => customerKey(s.customerPhone, s.customerName) === String(body?.customerKey ?? ''));
    if (!sales.length) throw new BadRequestException(POS_STOCK_TEXT.noDebt);
    const owed = sales.reduce((t, s) => t + s.balanceDue, 0);
    if (amount > Math.round(owed)) throw new BadRequestException(POS_STOCK_TEXT.tooMuch);
    let left = amount;
    await this.db.transaction(async (em) => {
      for (const s of sales) {
        if (left <= 0) break;
        const [cur] = await em.query(`SELECT "balanceDue" FROM public.sale WHERE id = $1::int FOR UPDATE`, [s.id]);
        const due = Number(cur?.balanceDue) || 0;
        const take = Math.min(due, left);
        if (take <= 0) continue;
        await em.query(`UPDATE public.sale SET "balanceDue" = "balanceDue" - $2::numeric, "amountPaid" = "amountPaid" + $2::numeric WHERE id = $1::int`, [s.id, take]);
        await em.query(`INSERT INTO public.pos_debt_payment ("sellerId", "workspaceId", kind, "saleId", amount, method, "createdByUserId")
          VALUES ($1::int, $2::int, 'customer', $3::int, $4::numeric, $5::varchar, $6::int)`, [sellerId, scope?.workspaceId ?? null, s.id, take, method, userId]);
        left -= take;
      }
    });
    return { paid: amount, left: Math.max(0, Math.round(owed - amount)) };
  }

  async paySupplier(sellerId: number, userId: number, body: any, scope?: SellerScope) {
    await this.need();
    const amount = Math.round(Number(body?.amount));
    const method = METHODS.includes(String(body?.method)) ? String(body.method) : 'cash';
    if (!Number.isFinite(amount) || amount <= 0) throw new BadRequestException(POS_STOCK_TEXT.badAmount);
    const supplier = (await this.debts(sellerId, scope)).suppliers.find((s: any) => s.id === Number(body?.supplierId));
    if (!supplier) throw new BadRequestException(POS_STOCK_TEXT.noSupplier);
    if (amount > supplier.owed) throw new BadRequestException(POS_STOCK_TEXT.tooMuch);
    await this.db.query(`INSERT INTO public.pos_debt_payment ("sellerId", "workspaceId", kind, "supplierId", amount, method, "createdByUserId")
      VALUES ($1::int, $2::int, 'supplier', $3::int, $4::numeric, $5::varchar, $6::int)`, [sellerId, scope?.workspaceId ?? null, supplier.id, amount, method, userId]);
    return { paid: amount, left: supplier.owed - amount };
  }

  /** For the cashier's drawer: cash taken for customer debts and cash paid to suppliers since the shift opened. */
  async shiftCash(sellerId: number, userId: number, since: Date | string) {
    if (!(await this.tablesReady())) return { debtIn: 0, supplierOut: 0 };
    const [r] = await this.db.query(`
      SELECT COALESCE(SUM(amount) FILTER (WHERE kind = 'customer'), 0) AS "debtIn",
             COALESCE(SUM(amount) FILTER (WHERE kind = 'supplier'), 0) AS "supplierOut"
        FROM public.pos_debt_payment
       WHERE "sellerId" = $1::int AND "createdByUserId" = $2::int AND method = 'cash' AND "createdAt" >= $3::timestamptz`, [sellerId, userId, since]);
    return { debtIn: Number(r?.debtIn) || 0, supplierOut: Number(r?.supplierOut) || 0 };
  }
}
