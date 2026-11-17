import * as fs from 'fs';
import * as path from 'path';
import { Controller, Get, Optional, Req } from '@nestjs/common';
import { describeRequestSource } from './common/trust-proxy';
import { metricsSnapshot } from './metrics/request-metrics';
import { spikeMode } from './traffic/spike-mode.service';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

const startedAt = new Date().toISOString();
const MIGRATION_FILE = /^(\d{13})-(.+)\.(js|ts)$/;

/**
 * Release control (logistics repair Gate 0): which commit is this process
 * actually running?
 *
 * The 6 October 2026 logistics audit found reviewed fixes merged to a branch
 * production did not deploy, and could only infer the deployed commit by
 * probing for routes. This endpoint answers the question directly.
 *
 * RENDER_GIT_COMMIT / RENDER_GIT_BRANCH are set by Render on every deploy.
 * Both are public facts about a public repository; nothing else is exposed.
 * Outside Render (local, CI) they are absent and reported as null.
 */
@Controller('version')
export class VersionController {
  constructor(@Optional() @InjectDataSource() private readonly dataSource?: DataSource) {}

  /**
   * The native app (#422 N0) asks on start: below minVersionCode it must update (Play Store link);
   * below latestVersionCode it may show a gentle "update" note. Both set in Render, 0 = no rule.
   */
  @Get('app')
  getAppVersion() {
    const n = (v?: string) => Math.max(0, parseInt(String(v || '0'), 10) || 0);
    return {
      minVersionCode: n(process.env.APP_MIN_VERSION_CODE),
      latestVersionCode: n(process.env.APP_LATEST_VERSION_CODE),
      androidUrl: 'https://play.google.com/store/apps/details?id=com.app.bishoo',
      iosUrl: process.env.APP_IOS_URL || null,
    };
  }

  @Get()
  getVersion() {
    return {
      service: 'kentexa-backend',
      commit: process.env.RENDER_GIT_COMMIT || null,
      branch: process.env.RENDER_GIT_BRANCH || null,
      startedAt,
    };
  }

  /**
   * Which schema is this process running against? (Gate 2.)
   *
   * Production applies migrations only up to a bound written into the start
   * command (MIGRATION_RUN_UPTO), so code can be deployed ahead of the tables
   * it needs and nothing says so until a request fails. This compares the
   * migration files shipped in this build with the database's own ledger:
   *
   *   pending           files with no matching ledger row -- not applied here
   *   sharedTimestamps  timestamps used by more than one file, with the names
   *                     the ledger actually holds for them
   *
   * Migration names only; no data. `null` when there is no ledger to read
   * (a database built by schema sync, as in CI).
   */
  /**
   * Issue #361: the caller's own address as the server sees it, open to anyone (it shows each
   * visitor only themselves), so the proxy setting can be confirmed without signing in.
   */
  @Get('request-source')
  requestSource(@Req() req: any) {
    return describeRequestSource(req);
  }

  /**
   * Traffic step 1 (issue #368): how this server process is coping, the last 5 minutes —
   * requests per minute, response times (p50/p95/p99), errors and "too many" answers, event
   * loop delay, memory, database connections in use and waiting, and the slowest queries
   * (their text only, never the values). No user data. Open, like a status page.
   */
  @Get('health')
  health() {
    let pool: { total: number; idle: number; waiting: number; max: number | null } | null = null;
    try {
      const p: any = (this.dataSource as any)?.driver?.master;
      if (p && typeof p.totalCount === 'number') {
        pool = { total: p.totalCount, idle: p.idleCount, waiting: p.waitingCount, max: p.options?.max ?? null };
      }
    } catch { pool = null; }
    return { commit: process.env.RENDER_GIT_COMMIT || null, spikeMode: spikeMode.isOn(), ...metricsSnapshot(pool) };
  }

  @Get('migrations')
  async getMigrations() {
    const files = this.migrationFiles();
    let ledger: Array<{ timestamp: string; name: string }>;
    try {
      if (!this.dataSource) return { ledger: null, shipped: files.length };
      ledger = await this.dataSource.query(
        'SELECT "timestamp"::text AS "timestamp", name FROM public.typeorm_migrations ORDER BY "timestamp", name',
      );
    } catch {
      return { ledger: null, shipped: files.length };
    }
    const appliedPerTimestamp = new Map<string, string[]>();
    for (const row of ledger) {
      appliedPerTimestamp.set(row.timestamp, [...(appliedPerTimestamp.get(row.timestamp) ?? []), row.name]);
    }
    const filesPerTimestamp = new Map<string, string[]>();
    for (const f of files) filesPerTimestamp.set(f.timestamp, [...(filesPerTimestamp.get(f.timestamp) ?? []), f.name]);

    const pending: string[] = [];
    const sharedTimestamps: Record<string, { files: string[]; applied: string[] }> = {};
    for (const [timestamp, names] of filesPerTimestamp) {
      const applied = appliedPerTimestamp.get(timestamp) ?? [];
      if (names.length > 1) {
        sharedTimestamps[timestamp] = { files: names, applied };
        for (const name of names) if (!applied.includes(name)) pending.push(name);
      } else if (applied.length === 0) {
        pending.push(names[0]);
      }
    }
    return {
      ledger: 'typeorm_migrations',
      shipped: files.length,
      applied: ledger.length,
      latestApplied: ledger.length ? ledger[ledger.length - 1].name : null,
      pending,
      sharedTimestamps,
    };
  }

  // 1788291600000-AddTransportRecurringSchedule.js -> the class/ledger name
  // AddTransportRecurringSchedule1788291600000 (this repository's convention).
  private migrationFiles(): Array<{ timestamp: string; name: string }> {
    try {
      return fs
        .readdirSync(path.join(__dirname, 'database', 'migrations'))
        .filter((f) => !f.includes('.spec.') && !f.endsWith('.d.ts'))
        .map((f) => MIGRATION_FILE.exec(f))
        .filter((m): m is RegExpExecArray => m !== null)
        .map((m) => ({ timestamp: m[1], name: `${m[2]}${m[1]}` }))
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.name.localeCompare(b.name));
    } catch {
      return [];
    }
  }
}
