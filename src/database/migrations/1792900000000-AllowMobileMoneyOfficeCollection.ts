import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Office payments for send-form shipments (owner 2026-10-24): an office records
 * what the sender paid it, cash or mobile money ("cash and mobile money only for
 * now"). The office's ledger (super_agent_cash_collection) allowed 'cash' only;
 * this widens that one check to ('cash', 'mobile_money'). No row changes.
 *
 * Deploy-order safe: until this runs, the app offers cash only (it reads this
 * check before offering mobile money). Owner rule: never run down() on live.
 */
export class AllowMobileMoneyOfficeCollection1792900000000 implements MigrationInterface {
  name = 'AllowMobileMoneyOfficeCollection1792900000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE public.super_agent_cash_collection
      DROP CONSTRAINT IF EXISTS "CHK_super_agent_cash_collection_payment_method"`);
    await q.query(`ALTER TABLE public.super_agent_cash_collection
      ADD CONSTRAINT "CHK_super_agent_cash_collection_payment_method" CHECK ("paymentMethod" IN ('cash', 'mobile_money'))`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE public.super_agent_cash_collection
      DROP CONSTRAINT IF EXISTS "CHK_super_agent_cash_collection_payment_method"`);
    await q.query(`ALTER TABLE public.super_agent_cash_collection
      ADD CONSTRAINT "CHK_super_agent_cash_collection_payment_method" CHECK ("paymentMethod" IN ('cash'))`);
  }
}
