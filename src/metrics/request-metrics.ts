import { monitorEventLoopDelay } from 'perf_hooks';

/**
 * Traffic step 1 (issue #368, owner approved 2026-11-16): live numbers for one server process,
 * kept in memory only (no database writes, so measuring never adds load). Rolling window of the
 * last 5 minutes, one bucket per minute. Read by GET /version/health.
 */
const WINDOW_MIN = 5;
const MAX_SAMPLES = 2000; // latency samples kept per minute (enough for a p95)
const MAX_SLOW = 20;
export const SLOW_QUERY_MS = 1000;

interface Bucket {
  minute: number;
  count: number;
  s2xx: number; s3xx: number; s4xx: number; s429: number; s5xx: number;
  ms: number[];
}

const buckets: Bucket[] = [];
const slowQueries = new Map<string, { sql: string; count: number; maxMs: number; lastAt: string }>();
let loopDelay: ReturnType<typeof monitorEventLoopDelay> | null = null;
let inFlight = 0;
let peakInFlight = 0;
const startedAt = Date.now();

const bucketFor = (now: number): Bucket => {
  const minute = Math.floor(now / 60000);
  let b = buckets[buckets.length - 1];
  if (!b || b.minute !== minute) {
    b = { minute, count: 0, s2xx: 0, s3xx: 0, s4xx: 0, s429: 0, s5xx: 0, ms: [] };
    buckets.push(b);
    while (buckets.length && buckets[0].minute <= minute - WINDOW_MIN) buckets.shift();
  }
  return b;
};

/** Record one finished request. */
export function recordRequest(status: number, ms: number, now = Date.now()): void {
  const b = bucketFor(now);
  b.count += 1;
  if (status === 429) b.s429 += 1;
  if (status >= 500) b.s5xx += 1; else if (status >= 400) b.s4xx += 1; else if (status >= 300) b.s3xx += 1; else b.s2xx += 1;
  if (b.ms.length < MAX_SAMPLES) b.ms.push(ms);
  else b.ms[Math.floor(Math.random() * MAX_SAMPLES)] = ms;
}

/** Express middleware: times every request. Never touches the request itself. */
export function requestMetricsMiddleware(_req: any, res: any, next: () => void): void {
  const t0 = process.hrtime.bigint();
  inFlight += 1;
  if (inFlight > peakInFlight) peakInFlight = inFlight;
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    inFlight -= 1;
    recordRequest(res.statusCode || 0, Number(process.hrtime.bigint() - t0) / 1e6);
  };
  res.on('finish', finish);
  res.on('close', finish);
  next();
}

/** A query that took long: kept by its text (no values, which may hold personal data). */
export function recordSlowQuery(sql: string, ms: number): void {
  const key = String(sql || '').replace(/\s+/g, ' ').trim().slice(0, 240);
  const cur = slowQueries.get(key);
  if (cur) { cur.count += 1; cur.maxMs = Math.max(cur.maxMs, ms); cur.lastAt = new Date().toISOString(); return; }
  if (slowQueries.size >= MAX_SLOW) {
    let smallest: string | null = null;
    slowQueries.forEach((v, k) => { if (!smallest || v.maxMs < slowQueries.get(smallest)!.maxMs) smallest = k; });
    if (smallest && slowQueries.get(smallest)!.maxMs >= ms) return;
    if (smallest) slowQueries.delete(smallest);
  }
  slowQueries.set(key, { sql: key, count: 1, maxMs: Math.round(ms), lastAt: new Date().toISOString() });
}

export function startEventLoopMonitor(): void {
  if (loopDelay) return;
  try { loopDelay = monitorEventLoopDelay({ resolution: 20 }); loopDelay.enable(); } catch { loopDelay = null; }
}

const pct = (sorted: number[], p: number) => (sorted.length ? Math.round(sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]) : null);

/** The numbers for GET /version/health. `pool` comes from the database driver when known. */
export function metricsSnapshot(pool: { total: number; idle: number; waiting: number; max: number | null } | null, now = Date.now()) {
  bucketFor(now);
  const recent = buckets.filter((b) => b.minute > Math.floor(now / 60000) - WINDOW_MIN);
  const all = recent.flatMap((b) => b.ms).sort((a, z) => a - z);
  const total = recent.reduce((n, b) => n + b.count, 0);
  const sum = (k: keyof Bucket) => recent.reduce((n, b) => n + (b[k] as number), 0);
  const mem = process.memoryUsage();
  const lagMs = loopDelay ? Math.round(loopDelay.mean / 1e6) : null;
  const lagP99 = loopDelay ? Math.round(loopDelay.percentile(99) / 1e6) : null;
  if (loopDelay) loopDelay.reset();
  return {
    window: `${WINDOW_MIN} minutes`,
    uptimeMinutes: Math.round((now - startedAt) / 60000),
    requests: {
      total,
      perMinute: recent.map((b) => ({ minute: new Date(b.minute * 60000).toISOString().slice(11, 16), count: b.count })),
      inFlight, peakInFlight,
      status: { ok2xx: sum('s2xx'), redirect3xx: sum('s3xx'), client4xx: sum('s4xx'), tooMany429: sum('s429'), server5xx: sum('s5xx') },
      latencyMs: { p50: pct(all, 50), p95: pct(all, 95), p99: pct(all, 99), max: all.length ? Math.round(all[all.length - 1]) : null },
    },
    eventLoopDelayMs: { mean: lagMs, p99: lagP99 },
    memoryMb: { rss: Math.round(mem.rss / 1048576), heapUsed: Math.round(mem.heapUsed / 1048576) },
    database: { pool, slowQueryMs: SLOW_QUERY_MS, slowQueries: [...slowQueries.values()].sort((a, z) => z.maxMs - a.maxMs) },
  };
}

export const __resetMetricsForTests = () => { buckets.length = 0; slowQueries.clear(); inFlight = 0; peakInFlight = 0; };
