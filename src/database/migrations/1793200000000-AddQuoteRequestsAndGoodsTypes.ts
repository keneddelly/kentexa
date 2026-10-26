import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Owner 2026-10-26:
 *  - each office ticks the goods it takes: small parcels, large goods, containers
 *    (super_agent."goodsTypes"; NULL = small parcels only, what offices do today);
 *  - "Omba bei": anyone (a customer or an office) asks for prices to hire a whole
 *    vehicle, or to send large goods / a container; transporters (vehicles) or offices
 *    (large goods) reply with a price; the requester picks one. KenteXa holds no money.
 */
export class AddQuoteRequestsAndGoodsTypes1793200000000 implements MigrationInterface {
  name = 'AddQuoteRequestsAndGoodsTypes1793200000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "super_agent" ADD COLUMN IF NOT EXISTS "goodsTypes" jsonb`);
    await q.query(`
      CREATE TABLE IF NOT EXISTS "quote_request" (
        "id" SERIAL PRIMARY KEY,
        "kind" varchar(16) NOT NULL,
        "requesterUserId" integer NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
        "requesterOfficeId" integer NULL REFERENCES "super_agent"("id") ON DELETE SET NULL,
        "fromText" varchar(200) NOT NULL,
        "fromCity" varchar(100) NOT NULL,
        "toText" varchar(200) NOT NULL,
        "toCity" varchar(100) NOT NULL,
        "travelDate" date NULL,
        "vehicleType" varchar(30) NULL,
        "goodsType" varchar(20) NULL,
        "description" text NOT NULL,
        "weightKg" numeric(10,2) NULL,
        "phone" varchar(20) NOT NULL,
        "status" varchar(16) NOT NULL DEFAULT 'open',
        "acceptedOfferId" integer NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_quote_request_kind" CHECK ("kind" IN ('vehicle', 'goods')),
        CONSTRAINT "CHK_quote_request_status" CHECK ("status" IN ('open', 'accepted', 'cancelled'))
      )`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_quote_request_open" ON "quote_request" ("status", "kind", "createdAt")`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_quote_request_requester" ON "quote_request" ("requesterUserId")`);
    await q.query(`
      CREATE TABLE IF NOT EXISTS "quote_offer" (
        "id" SERIAL PRIMARY KEY,
        "requestId" integer NOT NULL REFERENCES "quote_request"("id") ON DELETE CASCADE,
        "responderType" varchar(20) NOT NULL,
        "responderId" integer NOT NULL,
        "responderUserId" integer NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
        "price" integer NOT NULL,
        "note" text NULL,
        "status" varchar(16) NOT NULL DEFAULT 'offered',
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_quote_offer_type" CHECK ("responderType" IN ('transport', 'office')),
        CONSTRAINT "CHK_quote_offer_status" CHECK ("status" IN ('offered', 'accepted', 'declined')),
        CONSTRAINT "CHK_quote_offer_price" CHECK ("price" > 0),
        CONSTRAINT "UQ_quote_offer_responder" UNIQUE ("requestId", "responderType", "responderId")
      )`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "quote_offer"`);
    await q.query(`DROP TABLE IF EXISTS "quote_request"`);
    await q.query(`ALTER TABLE "super_agent" DROP COLUMN IF EXISTS "goodsTypes"`);
  }
}
