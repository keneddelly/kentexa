import { MigrationInterface, QueryRunner } from 'typeorm';

/** Cash collected by a local Agent at recipient handover. No historical inference/backfill. */
export class AddAgentCodCollection1788280800000 implements MigrationInterface {
  name = 'AddAgentCodCollection1788280800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE public."order"
      ADD COLUMN "codBalanceCollectedByLocalAgentId" integer`);
    await queryRunner.query(`ALTER TABLE public."order"
      ADD CONSTRAINT "FK_order_cod_local_agent" FOREIGN KEY ("codBalanceCollectedByLocalAgentId")
      REFERENCES public.agent(id) ON DELETE RESTRICT`);
    await queryRunner.query(`ALTER TABLE public."order"
      ADD CONSTRAINT "CHK_order_cod_collector_exclusive" CHECK (
        "codBalanceCollectedByAgentId" IS NULL OR "codBalanceCollectedByLocalAgentId" IS NULL)`);
    await queryRunner.query(`CREATE TABLE public.agent_cod_collection (
      id bigserial PRIMARY KEY,
      "orderId" integer NOT NULL UNIQUE REFERENCES public."order"(id) ON DELETE RESTRICT,
      "parcelId" integer NOT NULL UNIQUE REFERENCES public.parcel(id) ON DELETE RESTRICT,
      "custodyEventId" integer NOT NULL UNIQUE REFERENCES public.parcel_custody_event(id) ON DELETE RESTRICT,
      "agentId" integer NOT NULL REFERENCES public.agent(id) ON DELETE RESTRICT,
      "collectedAmount" numeric(12,2) NOT NULL,
      "cashLiability" numeric(12,2) NOT NULL,
      "handlingFee" numeric(12,2) NOT NULL,
      "kentexaShare" numeric(12,2) NOT NULL,
      "agentShare" numeric(12,2) NOT NULL,
      "orderSource" varchar(64) NOT NULL,
      "recordedAt" timestamp without time zone NOT NULL DEFAULT now(),
      CONSTRAINT "CHK_agent_cod_amounts" CHECK (
        "collectedAmount" >= 0 AND "cashLiability" >= 0 AND
        "cashLiability" <= "collectedAmount" AND "handlingFee" >= 0 AND
        "kentexaShare" >= 0 AND "agentShare" >= 0 AND
        "kentexaShare" + "agentShare" = "handlingFee")
    )`);
    await queryRunner.query(`CREATE INDEX "IDX_agent_cod_collection_agent"
      ON public.agent_cod_collection ("agentId", "recordedAt")`);
    await queryRunner.query(`CREATE FUNCTION public."fn_agent_cod_collection_immutable"()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'Agent COD collection history is immutable' USING ERRCODE = '23514';
      END $$`);
    await queryRunner.query(`CREATE TRIGGER "TRG_agent_cod_collection_immutable"
      BEFORE UPDATE OR DELETE ON public.agent_cod_collection
      FOR EACH ROW EXECUTE FUNCTION public."fn_agent_cod_collection_immutable"()`);
    await queryRunner.query(`CREATE TRIGGER "TRG_agent_cod_collection_no_truncate"
      BEFORE TRUNCATE ON public.agent_cod_collection
      FOR EACH STATEMENT EXECUTE FUNCTION public."fn_agent_cod_collection_immutable"()`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('LOCK TABLE public.agent_cod_collection IN ACCESS EXCLUSIVE MODE');
    await queryRunner.query('LOCK TABLE public."order" IN ACCESS EXCLUSIVE MODE');
    const [{ collections }] = await queryRunner.query(`SELECT count(*)::int AS collections FROM public.agent_cod_collection`);
    const [{ collectors }] = await queryRunner.query(`SELECT count(*)::int AS collectors FROM public."order"
      WHERE "codBalanceCollectedByLocalAgentId" IS NOT NULL`);
    if (collections || collectors) throw new Error('Cannot remove recorded Agent COD collections');
    await queryRunner.query('DROP TABLE public.agent_cod_collection');
    await queryRunner.query('DROP FUNCTION public."fn_agent_cod_collection_immutable"()');
    await queryRunner.query('ALTER TABLE public."order" DROP CONSTRAINT "CHK_order_cod_collector_exclusive"');
    await queryRunner.query('ALTER TABLE public."order" DROP CONSTRAINT "FK_order_cod_local_agent"');
    await queryRunner.query('ALTER TABLE public."order" DROP COLUMN "codBalanceCollectedByLocalAgentId"');
  }
}
