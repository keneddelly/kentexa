import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InAppNotificationService } from '../notifications/in-app-notification.service';
import { ownershipFlag } from '../ownership/ownership-feature-flags.service';
import type { SellerScope } from '../business/seller-scope.service';
import { POS_DAY_TEXT, SaleRow, drawer, saleCash, sumByMethod } from './pos-day';

/**
 * POS part 2 (owner approved 2026-11-03, design "KenteXa POS ya kisasa", board "Zamu"):
 *   Leo        today's POS sales (Tanzania day): total, receipts, by payment method, profit on
 *              goods (cost prices the shop saved), best sellers, expenses.
 *   Matumizi   a shop expense with its reason; cash ones come off the drawer.
 *   Zamu       a cashier opens a shift with starting cash; closing shows what the drawer should
 *              hold, takes the counted cash, keeps the difference and tells the owner in the app.
 * Same seller and workspace rules as the sales themselves. Before migration 1794800000000 the
 * day still shows; shifts and expenses are off.
 */
const DAY = `(now() AT TIME ZONE 'Africa/Dar_es_Salaam')::date`;
const LOCAL_DAY = (col: string) => `((${col}) AT TIME ZONE 'Africa/Dar_es_Salaam')::date`;
const tzs = (v: unknown) => `TZS ${Math.round(Number(v) || 0).toLocaleString('en-US')}`;

@Injectable()
export class PosDayService {
  private ready = false;
  private checkedAt = 0;

  constructor(
    private readonly db: DataSource,
    @Optional() private readonly notifications?: InAppNotificationService,
  ) {}

  async tablesReady(): Promise<boolean> {
    if (!this.ready && Date.now() - this.checkedAt > 60_000) {
      this.checkedAt = Date.now();
      try {
        const [r] = await this.db.query(`SELECT to_regclass('public.pos_shift') IS NOT NULL AS ok`);
        this.ready = Boolean(r?.ok);
      } catch { this.ready = false; }
    }
    return this.ready;
  }

  /** The same workspace rule as SalesService.saleWs, as SQL on alias `a` (param index next). */
  private ws(scope: SellerScope | undefined, alias: string, params: any[]): string {
    if (!scope || (scope as any).delegated || !ownershipFlag('SALE_WORKSPACE_ENFORCE')) return '';
    if (scope.workspaceId == null) return ` AND ${alias}."workspaceId" IS NULL`;
    params.push(scope.workspaceId);
    return ` AND ${alias}."workspaceId" = $${params.length}::int`;
  }

  private async salesOf(sellerId: number, scope: SellerScope | undefined, extra: string, extraParams: any[]): Promise<Array<SaleRow & { id: number }>> {
    const params: any[] = [sellerId, ...extraParams];
    const w = this.ws(scope, 's', params);
    return this.db.query(`
      SELECT s.id, s.total, s."paymentMethod", s."amountPaid", s."changeDue", s."balanceDue", s.payments
        FROM public.sale s
       WHERE s."sellerId" = $1::int AND s.status = 'completed' AND s.channel = 'local_pos' ${extra}${w}`, params);
  }

  async today(sellerId: number, userId: number, scope?: SellerScope) {
    const sales = await this.salesOf(sellerId, scope, `AND ${LOCAL_DAY('COALESCE(s."soldAt", s."createdAt")')} = ${DAY}`, []);
    const ids = sales.map((s) => Number(s.id));
    const total = sales.reduce((sum, s) => sum + Number(s.total || 0), 0);
    let profit: number | null = null;
    let top: Array<{ name: string; qty: number }> = [];
    if (ids.length) {
      const [p] = await this.db.query(`
        SELECT COALESCE(SUM((i."unitPrice" - p."costPrice") * i.quantity - COALESCE(i."lineDiscount", 0)), 0) AS profit,
               COUNT(*) FILTER (WHERE p."costPrice" IS NOT NULL)::int AS known
          FROM public.sale_item i JOIN public.product p ON p.id = i."productId"
         WHERE i."saleId" = ANY($1::int[]) AND p."costPrice" IS NOT NULL`, [ids]);
      profit = Number(p?.known) > 0 ? Math.round(Number(p.profit)) : null;
      top = (await this.db.query(`
        SELECT i."productName" AS name, SUM(i.quantity)::int AS qty FROM public.sale_item i
         WHERE i."saleId" = ANY($1::int[]) GROUP BY i."productName" ORDER BY qty DESC, name ASC LIMIT 5`, [ids]))
        .map((r: any) => ({ name: r.name, qty: Number(r.qty) }));
    }
    const ready = await this.tablesReady();
    let expenses: any[] = [];
    let shift: any = null;
    if (ready) {
      const params: any[] = [sellerId];
      const w = this.ws(scope, 'e', params);
      expenses = (await this.db.query(`
        SELECT e.id, e.amount, e.reason, e."paidFrom", e."createdAt" FROM public.pos_expense e
         WHERE e."sellerId" = $1::int AND ${LOCAL_DAY('e."createdAt"')} = ${DAY}${w} ORDER BY e.id DESC`, params))
        .map((e: any) => ({ ...e, id: Number(e.id), amount: Number(e.amount) }));
      shift = await this.openShiftView(sellerId, userId, scope);
    }
    return {
      ready,
      receipts: sales.length,
      total: Math.round(total),
      byMethod: sumByMethod(sales),
      profit,
      top,
      expenses,
      expensesTotal: expenses.reduce((s, e) => s + e.amount, 0),
      shift,
    };
  }

  /** The cashier's open shift with the drawer so far (null when none is open). */
  private async openShiftView(sellerId: number, userId: number, scope?: SellerScope) {
    const [sh] = await this.db.query(`SELECT * FROM public.pos_shift WHERE "sellerId" = $1::int AND "openedByUserId" = $2::int AND status = 'open'`, [sellerId, userId]);
    if (!sh) return null;
    const parts = await this.shiftParts(sellerId, userId, sh, scope);
    return {
      id: Number(sh.id), openedAt: sh.openedAt, openingFloat: Number(sh.openingFloat),
      cashSales: parts.cashSales, cashDebtPayments: parts.cashDebtPayments, cashExpenses: parts.cashExpenses,
      expected: drawer(Number(sh.openingFloat), parts.cashSales, parts.cashDebtPayments, parts.cashExpenses).expected,
    };
  }

  private async shiftParts(sellerId: number, userId: number, sh: any, scope?: SellerScope) {
    const sales = await this.salesOf(sellerId, scope,
      `AND s."createdByUserId" = $2::int AND COALESCE(s."soldAt", s."createdAt") >= $3::timestamptz`, [userId, sh.openedAt]);
    const cashSales = Math.round(sales.reduce((sum, s) => sum + saleCash(s), 0) * 100) / 100;
    const [ex] = await this.db.query(`SELECT COALESCE(SUM(amount), 0) AS cash FROM public.pos_expense
      WHERE "shiftId" = $1::int AND "paidFrom" = 'cash'`, [sh.id]);
    // Debts paid in cash arrive with POS part 3 (Madeni); none are recorded before it.
    return { cashSales, cashDebtPayments: 0, cashExpenses: Number(ex?.cash) || 0 };
  }

  async openShift(sellerId: number, userId: number, openingFloat: unknown, scope?: SellerScope) {
    if (!(await this.tablesReady())) throw new BadRequestException(POS_DAY_TEXT.notReady);
    const float = Math.round(Number(openingFloat ?? 0));
    if (!Number.isFinite(float) || float < 0 || float > 100_000_000) throw new BadRequestException(POS_DAY_TEXT.badAmount);
    const rows = await this.db.query(`
      INSERT INTO public.pos_shift ("sellerId", "workspaceId", "openedByUserId", "openingFloat")
      VALUES ($1::int, $2::int, $3::int, $4::numeric) ON CONFLICT DO NOTHING RETURNING id`,
      [sellerId, scope?.workspaceId ?? null, userId, float]);
    if (!rows?.length) throw new BadRequestException(POS_DAY_TEXT.alreadyOpen);
    return this.openShiftView(sellerId, userId, scope);
  }

  async addExpense(sellerId: number, userId: number, body: { amount?: unknown; reason?: unknown; paidFrom?: unknown }, scope?: SellerScope) {
    if (!(await this.tablesReady())) throw new BadRequestException(POS_DAY_TEXT.notReady);
    const amount = Math.round(Number(body?.amount));
    if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000_000) throw new BadRequestException(POS_DAY_TEXT.badAmount);
    const reason = String(body?.reason ?? '').trim().slice(0, 120);
    if (reason.length < 3) throw new BadRequestException(POS_DAY_TEXT.badReason);
    const paidFrom = body?.paidFrom === 'mobile' ? 'mobile' : 'cash';
    const [sh] = await this.db.query(`SELECT id FROM public.pos_shift WHERE "sellerId" = $1::int AND "openedByUserId" = $2::int AND status = 'open'`, [sellerId, userId]);
    const [row] = await this.db.query(`
      INSERT INTO public.pos_expense ("sellerId", "workspaceId", "shiftId", amount, reason, "paidFrom", "createdByUserId")
      VALUES ($1::int, $2::int, $3::int, $4::numeric, $5::varchar, $6::varchar, $7::int) RETURNING id, amount, reason, "paidFrom", "createdAt"`,
      [sellerId, scope?.workspaceId ?? null, sh?.id ?? null, amount, reason, paidFrom, userId]);
    return { ...row, id: Number(row.id), amount: Number(row.amount) };
  }

  async closeShift(sellerId: number, userId: number, body: { countedCash?: unknown; note?: unknown }, scope?: SellerScope) {
    if (!(await this.tablesReady())) throw new BadRequestException(POS_DAY_TEXT.notReady);
    const counted = Math.round(Number(body?.countedCash));
    if (!Number.isFinite(counted) || counted < 0 || counted > 1_000_000_000) throw new BadRequestException(POS_DAY_TEXT.badAmount);
    const [sh] = await this.db.query(`SELECT * FROM public.pos_shift WHERE "sellerId" = $1::int AND "openedByUserId" = $2::int AND status = 'open'`, [sellerId, userId]);
    if (!sh) throw new BadRequestException(POS_DAY_TEXT.noShift);
    const parts = await this.shiftParts(sellerId, userId, sh, scope);
    const d = drawer(Number(sh.openingFloat), parts.cashSales, parts.cashDebtPayments, parts.cashExpenses, counted);
    const note = typeof body?.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 200) : null;
    const [closed] = await this.db.query(`
      UPDATE public.pos_shift SET status = 'closed', "closedAt" = now(), "closedByUserId" = $2::int,
        "cashSales" = $3::numeric, "cashDebtPayments" = $4::numeric, "cashExpenses" = $5::numeric,
        "expectedCash" = $6::numeric, "countedCash" = $7::numeric, difference = $8::numeric, note = $9::varchar
       WHERE id = $1::int AND status = 'open' RETURNING *`,
      [sh.id, userId, parts.cashSales, parts.cashDebtPayments, parts.cashExpenses, d.expected, counted, d.difference, note]);
    if (!closed) throw new BadRequestException(POS_DAY_TEXT.noShift);
    // The owner gets the report in the app (no SMS). The seller id is the owner's user.
    const [who] = await this.db.query(`SELECT name FROM public."user" WHERE id = $1::int`, [userId]).catch(() => []);
    const diff = Number(d.difference);
    const diffText = diff === 0 ? 'Sawa kabisa' : diff < 0 ? `Pungufu ${tzs(-diff)}` : `Ziada ${tzs(diff)}`;
    await this.notifications?.notify({
      userId: sellerId, type: 'pos_shift_closed', title: 'Zamu imefungwa',
      body: `${who?.name || 'Mhudumu'}: droo ${tzs(d.expected)}, amehesabu ${tzs(counted)}. ${diffText}.${note ? ` ${note}` : ''}`,
      actionPage: 'POS', sourceType: 'pos_shift', sourceId: Number(sh.id),
    }).catch(() => undefined);
    return { id: Number(closed.id), expected: d.expected, counted, difference: d.difference, cashSales: parts.cashSales, cashExpenses: parts.cashExpenses, openingFloat: Number(sh.openingFloat) };
  }

  async shifts(sellerId: number, scope?: SellerScope) {
    if (!(await this.tablesReady())) return [];
    const params: any[] = [sellerId];
    const w = this.ws(scope, 'sh', params);
    const rows: any[] = await this.db.query(`
      SELECT sh.*, u.name AS "cashierName" FROM public.pos_shift sh LEFT JOIN public."user" u ON u.id = sh."openedByUserId"
       WHERE sh."sellerId" = $1::int${w} ORDER BY sh.id DESC LIMIT 30`, params);
    return rows.map((r) => ({
      id: Number(r.id), cashierName: r.cashierName, status: r.status, openedAt: r.openedAt, closedAt: r.closedAt,
      openingFloat: Number(r.openingFloat), expectedCash: r.expectedCash == null ? null : Number(r.expectedCash),
      countedCash: r.countedCash == null ? null : Number(r.countedCash), difference: r.difference == null ? null : Number(r.difference), note: r.note,
    }));
  }
}
