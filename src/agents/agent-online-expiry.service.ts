import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';

/**
 * D1 (owner 2026-10-14): an agent's "online" ends by itself after a period
 * with no activity, so jobs are never offered to someone who is not there.
 *
 * Activity = any KenteXa screen open on the agent's phone: the app calls
 * POST /agents/seen every few minutes while it is open, which refreshes
 * agent."lastOnlineAt" for an agent who is online ("last seen while online";
 * nothing else in the code reads that column).
 *
 * Setting (environment, optional, default built in):
 *   AGENT_ONLINE_EXPIRY_MINUTES   15..1440, default 60
 * Jobs the agent already accepted are never touched: going offline only
 * stops new offers.
 */
export function agentOnlineExpiryMinutes(env: Record<string, string | undefined> = process.env): number {
  const n = Number.parseInt(String(env.AGENT_ONLINE_EXPIRY_MINUTES ?? '').trim(), 10);
  return Number.isFinite(n) ? Math.min(1440, Math.max(15, n)) : 60;
}

export const AGENT_AUTO_OFFLINE_EVENT = 'AGENT_AUTO_OFFLINE';

/** TypeORM's raw UPDATE ... RETURNING answers [rows, affectedCount]; a SELECT answers rows. */
const returnedRows = (res: any): any[] => (Array.isArray(res) && Array.isArray(res[0]) ? res[0] : Array.isArray(res) ? res : []);

@Injectable()
export class AgentOnlineExpiryService {
  private readonly logger = new Logger(AgentOnlineExpiryService.name);
  constructor(private readonly db: DataSource) {}

  @Cron('*/5 * * * *')
  async tick(): Promise<void> {
    try { await this.expire(new Date()); }
    catch (err: any) { this.logger.warn(`Agent online expiry failed: ${err?.message || err}`); }
  }

  /** Switches off every online agent not seen for the expiry time. Returns their ids. */
  async expire(now: Date, minutes = agentOnlineExpiryMinutes()): Promise<number[]> {
    return this.db.transaction(async (em) => {
      const lock: any[] = await em.query(`SELECT pg_try_advisory_xact_lock(hashtext('agent-online-expiry')) AS ok`);
      if (!lock[0]?.ok) return [];
      const rows: Array<{ id: number }> = returnedRows(await em.query(`
        UPDATE public.agent SET "isOnline" = false
         WHERE "isOnline" = true
           AND COALESCE("lastOnlineAt", 'epoch'::timestamp) < $1::timestamp - make_interval(mins => $2::int)
        RETURNING id`, [now, minutes]));
      for (const r of rows) {
        await em.query(`INSERT INTO public.activity_events
            ("eventType", category, "actorType", "targetType", "targetId", metadata, severity, visibility)
          VALUES ($1, 'AGENT', 'system', 'agent', $2, $3::jsonb, 'info', 'admin')`,
          [AGENT_AUTO_OFFLINE_EVENT, r.id, JSON.stringify({ minutes })]);
      }
      if (rows.length) this.logger.log(`Agents switched offline after ${minutes} min without activity: ${rows.length}`);
      return rows.map((r) => Number(r.id));
    });
  }

  /** "I'm here" from any open KenteXa screen: refreshes an online agent's last-seen time. */
  async markSeen(userId: number): Promise<{ online: boolean }> {
    const rows = returnedRows(await this.db.query(
      `UPDATE public.agent SET "lastOnlineAt" = now() WHERE "userId" = $1 AND "isOnline" = true RETURNING id`, [userId]));
    return { online: rows.length > 0 };
  }

  /** Why an offline agent is offline: 'inactive' when the expiry switched them off (since they last went online). */
  async offlineReason(agentId: number, isOnline: boolean, lastOnlineAt: Date | null): Promise<'inactive' | null> {
    if (isOnline) return null;
    const rows: any[] = await this.db.query(`
      SELECT 1 FROM public.activity_events
       WHERE "eventType" = $1 AND "targetType" = 'agent' AND "targetId" = $2
         AND "createdAt" >= COALESCE($3::timestamp, 'epoch'::timestamp)
       LIMIT 1`, [AGENT_AUTO_OFFLINE_EVENT, agentId, lastOnlineAt]);
    return rows.length ? 'inactive' : null;
  }
}
