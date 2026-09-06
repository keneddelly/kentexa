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
// Opt-in only, off by default -- local Postgres normally has no SSL
// configured at all, so this must never turn on implicitly (it would break
// every existing local migration:show/run invocation). Set DB_SSL=true
// (alongside the discrete DB_HOST/PORT/USERNAME/PASSWORD/NAME vars) only
// when explicitly targeting a host that requires SSL for external
// connections (e.g. Render Postgres) -- confirmed necessary: without this,
// TypeORM connecting via discrete host/port fields (no connection-string
// sslmode to infer from) gets an immediate ECONNRESET from Render's server
// rather than a graceful SSL-required error.
const useSsl = process.env.DB_SSL === 'true';

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'kentexa',
  ssl: useSsl ? { rejectUnauthorized: false } : false,
  synchronize: false,
  migrationsTableName: 'typeorm_migrations',
  // Timestamp-prefixed files only. This intentionally excludes migration
  // tests that live alongside the migration artifacts.
  migrations: [join(process.cwd(), 'src/database/migrations/[0-9]*{.ts,.js}')],
  entities: [],
});
