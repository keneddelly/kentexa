import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * POS part 2 (owner approved 2026-11-03, design "KenteXa POS ya kisasa", board "Zamu"):
 *   pos_shift    a cashier's shift: starting cash, then at closing what the drawer should hold
 *                (start + cash sales + debts paid in cash - cash expenses), what was counted and
 *                the difference. Closing sends the report to the owner in the app.
 *   pos_expense  a shop expense ("Matumizi") with its reason; cash ones come off the drawer.
 * Additive. Owner rule: never run down() on live.
 */
export class AddPosShiftsAndExpenses1794800000000 implements MigrationInterface {
  name = 'AddPosShiftsAndExpenses1794800000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE IF NOT EXISTS public.pos_shift (
      id SERIAL PRIMARY KEY,
      "sellerId" integer NOT NULL,
      "workspaceId" integer NULL,
      "openedByUserId" integer NOT NULL,
      "openedAt" timestamptz NOT NULL DEFAULT now(),
      "openingFloat" numeric(14,2) NOT NULL DEFAULT 0,
      status varchar(10) NOT NULL DEFAULT 'open',
      "closedAt" timestamptz NULL,
      "closedByUserId" integer NULL,
      "cashSales" numeric(14,2) NULL,
      "cashDebtPayments" numeric(14,2) NULL,
      "cashExpenses" numeric(14,2) NULL,
      "expectedCash" numeric(14,2) NULL,
      "countedCash" numeric(14,2) NULL,
      difference numeric(14,2) NULL,
      note varchar(200) NULL
    )`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_pos_shift_open" ON public.pos_shift ("sellerId", "openedByUserId") WHERE status = 'open'`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_pos_shift_seller" ON public.pos_shift ("sellerId", "openedAt")`);
    await q.query(`CREATE TABLE IF NOT EXISTS public.pos_expense (
      id SERIAL PRIMARY KEY,
      "sellerId" integer NOT NULL,
      "workspaceId" integer NULL,
      "shiftId" integer NULL,
      amount numeric(14,2) NOT NULL,
      reason varchar(120) NOT NULL,
      "paidFrom" varchar(10) NOT NULL DEFAULT 'cash',
      "createdByUserId" integer NOT NULL,
      "createdAt" timestamptz NOT NULL DEFAULT now()
    )`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_pos_expense_seller" ON public.pos_expense ("sellerId", "createdAt")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS public.pos_expense`);
    await q.query(`DROP TABLE IF EXISTS public.pos_shift`);
  }
}
