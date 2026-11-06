import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Stores each seller's Instagram professional-account connection.
 * OAuth access tokens are stored encrypted by the application.
 */
export class CreateInstagramBusinessConnection20261106100000
  implements MigrationInterface
{
  name = 'CreateInstagramBusinessConnection20261106100000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE public.instagram_business_connection (
        id SERIAL PRIMARY KEY,
        seller_id integer NOT NULL,
        instagram_user_id varchar(100) NOT NULL,
        instagram_username varchar(150),
        access_token_encrypted text NOT NULL,
        token_expires_at timestamp,
        scopes text[] NOT NULL DEFAULT '{}',
        status varchar(20) NOT NULL DEFAULT 'connected',
        connected_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_synced_at timestamp,
        created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_instagram_connection_seller
          FOREIGN KEY (seller_id) REFERENCES public.user(id) ON DELETE CASCADE,
        CONSTRAINT uq_instagram_connection_account UNIQUE (instagram_user_id),
        CONSTRAINT uq_instagram_connection_seller_account
          UNIQUE (seller_id, instagram_user_id)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_instagram_connection_seller_status
      ON public.instagram_business_connection (seller_id, status)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS public.instagram_business_connection');
  }
}
