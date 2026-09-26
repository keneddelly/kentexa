import { MigrationInterface, QueryRunner } from 'typeorm';

/** Append-only settlement evidence for an existing local Agent COD collection. */
export class AddAgentCodRemittance1788281400000 implements MigrationInterface {
  name = 'AddAgentCodRemittance1788281400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE public.agent_cod_remittance (
      id bigserial PRIMARY KEY,
      "collectionId" bigint NOT NULL REFERENCES public.agent_cod_collection(id) ON DELETE RESTRICT,
      "amount" numeric(12,2) NOT NULL CHECK ("amount" > 0),
      "method" varchar(32) NOT NULL CHECK (length(trim("method")) > 0),
      "reference" varchar(128) NOT NULL CHECK (length(trim("reference")) > 0),
      "operationKey" uuid NOT NULL UNIQUE,
      "recordedByAdminUserId" integer NOT NULL,
      "recordedAt" timestamp without time zone NOT NULL DEFAULT now()
    )`);
    await queryRunner.query(`CREATE INDEX "IDX_agent_cod_remittance_collection"
      ON public.agent_cod_remittance ("collectionId", "recordedAt")`);
    await queryRunner.query(`CREATE FUNCTION public."fn_agent_cod_remittance_limit"()
      RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE due numeric(12,2); received numeric(12,2);
      BEGIN
        SELECT "cashLiability" INTO due FROM public.agent_cod_collection
          WHERE id=NEW."collectionId" FOR UPDATE;
        IF due IS NULL THEN RAISE EXCEPTION 'COD collection not found' USING ERRCODE = '23503'; END IF;
        SELECT COALESCE(sum("amount"),0) INTO received FROM public.agent_cod_remittance
          WHERE "collectionId"=NEW."collectionId";
        IF received + NEW."amount" > due THEN
          RAISE EXCEPTION 'COD remittance exceeds collection liability' USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
      END $$`);
    await queryRunner.query(`CREATE TRIGGER "TRG_agent_cod_remittance_limit"
      BEFORE INSERT ON public.agent_cod_remittance
      FOR EACH ROW EXECUTE FUNCTION public."fn_agent_cod_remittance_limit"()`);
    await queryRunner.query(`CREATE FUNCTION public."fn_agent_cod_remittance_immutable"()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'Agent COD remittance history is immutable' USING ERRCODE = '23514';
      END $$`);
    await queryRunner.query(`CREATE TRIGGER "TRG_agent_cod_remittance_immutable"
      BEFORE UPDATE OR DELETE ON public.agent_cod_remittance
      FOR EACH ROW EXECUTE FUNCTION public."fn_agent_cod_remittance_immutable"()`);
    await queryRunner.query(`CREATE TRIGGER "TRG_agent_cod_remittance_no_truncate"
      BEFORE TRUNCATE ON public.agent_cod_remittance
      FOR EACH STATEMENT EXECUTE FUNCTION public."fn_agent_cod_remittance_immutable"()`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('LOCK TABLE public.agent_cod_remittance IN ACCESS EXCLUSIVE MODE');
    const [{ count }] = await queryRunner.query('SELECT count(*)::int AS count FROM public.agent_cod_remittance');
    if (count) throw new Error('Cannot remove recorded Agent COD remittances');
    await queryRunner.query('DROP TABLE public.agent_cod_remittance');
    await queryRunner.query('DROP FUNCTION public."fn_agent_cod_remittance_limit"()');
    await queryRunner.query('DROP FUNCTION public."fn_agent_cod_remittance_immutable"()');
  }
}
