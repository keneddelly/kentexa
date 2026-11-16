import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';

/**
 * Privacy (issue #365, owner approved 2026-11-16): browsing records (visits, taps, searches)
 * are kept 12 months, then removed. Orders, payments and the activity audit trail are not
 * touched here. Runs every night at 03:40 Tanzania time, in batches, so it never holds the
 * database for long.
 */
export const ANALYTICS_RETENTION_MONTHS = 12;
const BATCH = 5000;
const MAX_BATCHES = 40;

@Injectable()
export class AnalyticsRetentionService {
  private readonly logger = new Logger(AnalyticsRetentionService.name);

  constructor(private readonly dataSource: DataSource) {}

  @Cron('40 3 * * *', { timeZone: 'Africa/Dar_es_Salaam' })
  async nightly(): Promise<void> {
    await this.run().catch((err) => this.logger.warn(`Analytics retention skipped: ${err}`));
  }

  async run(): Promise<{ events: number; sessions: number }> {
    const cutoff = `NOW() - INTERVAL '${ANALYTICS_RETENTION_MONTHS} months'`;
    let events = 0;
    for (let i = 0; i < MAX_BATCHES; i += 1) {
      const res = await this.dataSource.query(
        `DELETE FROM public.analytics_events WHERE id IN (
           SELECT id FROM public.analytics_events WHERE "createdAt" < ${cutoff} ORDER BY id LIMIT ${BATCH})`);
      const n = Array.isArray(res) ? Number(res[1] ?? 0) : Number((res as any)?.rowCount ?? 0);
      events += n;
      if (n < BATCH) break;
    }
    const s = await this.dataSource.query(
      `DELETE FROM public.analytics_sessions s WHERE s."createdAt" < ${cutoff}
         AND NOT EXISTS (SELECT 1 FROM public.analytics_events e WHERE e."sessionId" = s."sessionId")`);
    const sessions = Array.isArray(s) ? Number(s[1] ?? 0) : Number((s as any)?.rowCount ?? 0);
    // Viral engine (#381): link opens follow the same 12 months.
    await Promise.resolve()
      .then(() => this.dataSource.query(`DELETE FROM public.share_visit WHERE "createdAt" < ${cutoff}`))
      .catch(() => undefined);
    // Post views of guests (owner 2026-11-16): the same 12 months.
    await Promise.resolve()
      .then(() => this.dataSource.query(`DELETE FROM public.post_guest_view WHERE "createdAt" < ${cutoff}`))
      .catch(() => undefined);
    if (events || sessions) this.logger.log(`Analytics retention: removed ${events} events, ${sessions} sessions older than ${ANALYTICS_RETENTION_MONTHS} months`);
    return { events, sessions };
  }
}
