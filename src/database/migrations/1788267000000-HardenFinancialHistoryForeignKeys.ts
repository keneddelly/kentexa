import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * I2G gate H. Durable finance/history ownership FKs become ON DELETE RESTRICT
 * so Sale/Payout/Invoice/Wallet/Order history can never be destroyed (or an
 * order detached from its seller) by a user/order/wallet/listing deletion.
 * No data change. MUST be applied together with (or after) the application
 * lifecycle changes that turn user / classified deletion of records with
 * financial history into an explicit 409 (UsersService.remove,
 * ClassifiedsService.remove) -- otherwise those deletes would surface a raw
 * FK violation. Constraints are found by (table, column) so the migration is
 * independent of generated constraint names.
 */
const TARGETS: Array<{ table: string; column: string; ref: string; oldAction: string }> = [
  { table: 'sale', column: 'sellerId', ref: 'public."user"(id)', oldAction: 'CASCADE' },
  { table: 'payout', column: 'sellerId', ref: 'public."user"(id)', oldAction: 'CASCADE' },
  { table: 'payout', column: 'orderId', ref: 'public."order"(id)', oldAction: 'CASCADE' },
  { table: 'invoice', column: 'orderId', ref: 'public."order"(id)', oldAction: 'CASCADE' },
  { table: 'invoice', column: 'buyerId', ref: 'public."user"(id)', oldAction: 'CASCADE' },
  { table: 'wallet_transaction', column: 'walletId', ref: 'public.wallet(id)', oldAction: 'CASCADE' },
  { table: 'classified_invoice_request', column: 'sellerId', ref: 'public."user"(id)', oldAction: 'CASCADE' },
  { table: 'classified_invoice_request', column: 'buyerId', ref: 'public."user"(id)', oldAction: 'CASCADE' },
  { table: 'classified_invoice_request', column: 'classifiedId', ref: 'public.classified(id)', oldAction: 'CASCADE' },
  { table: 'order', column: 'sellerId', ref: 'public."user"(id)', oldAction: 'SET NULL' },
];

export class HardenFinancialHistoryForeignKeys1788267000000 implements MigrationInterface {
  name = 'HardenFinancialHistoryForeignKeys1788267000000';

  private async convert(q: QueryRunner, direction: 'up' | 'down') {
    for (const t of TARGETS) {
      const action = direction === 'up' ? 'RESTRICT' : t.oldAction;
      const rows = await q.query(
        `SELECT c.conname FROM pg_constraint c
           JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
          WHERE c.contype = 'f' AND c.conrelid = $1::regclass AND a.attname = $2`,
        [`public."${t.table}"`, t.column],
      );
      if (!rows[0]) throw new Error(`FK on ${t.table}.${t.column} not found`);
      const name = rows[0].conname as string;
      await q.query(`ALTER TABLE public."${t.table}" DROP CONSTRAINT "${name}"`);
      await q.query(
        `ALTER TABLE public."${t.table}" ADD CONSTRAINT "${name}" FOREIGN KEY ("${t.column}") REFERENCES ${t.ref} ON DELETE ${action} NOT VALID`,
      );
      await q.query(`ALTER TABLE public."${t.table}" VALIDATE CONSTRAINT "${name}"`);
    }
  }

  async up(queryRunner: QueryRunner): Promise<void> {
    await this.convert(queryRunner, 'up');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await this.convert(queryRunner, 'down');
  }
}
