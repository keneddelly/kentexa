import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { join } from 'path';

config();

/**
 * Migration-only datasource. Application entities are intentionally omitted:
 * the authoritative baseline is the inspected live PostgreSQL schema dump,
 * including tables which have no current source entity.
 */
export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'kentexa',
  synchronize: false,
  migrationsTableName: 'typeorm_migrations',
  // Timestamp-prefixed files only. This intentionally excludes migration
  // tests that live alongside the migration artifacts.
  migrations: [join(process.cwd(), 'src/database/migrations/[0-9]*{.ts,.js}')],
  entities: [],
});
