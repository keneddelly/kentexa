import { Logger as TypeOrmLogger } from 'typeorm';
import { recordSlowQuery } from './request-metrics';

/**
 * Traffic step 1 (issue #368): database queries slower than SLOW_QUERY_MS are counted by their
 * text (never the values) for GET /version/health. Everything else stays as quiet as before
 * (query logging was off).
 */
export class SlowQueryLogger implements TypeOrmLogger {
  logQuery(): void { /* off, as before */ }
  logQueryError(): void { /* errors surface through the request that ran them */ }
  logQuerySlow(time: number, query: string): void { recordSlowQuery(query, time); }
  logSchemaBuild(): void { /* not used in production */ }
  logMigration(): void { /* migrations log through their own runner */ }
  log(): void { /* off, as before */ }
}
