import { Injectable } from '@nestjs/common';

/**
 * Traffic step 2 (issue #368, owner approved 2026-11-16): an emergency switch for a traffic spike.
 * When on, KenteXa keeps its core (feed, posts, chat, orders, payments, sign-in) and pauses the
 * expensive extras: AI help other than safety checks, and saving browsing records. Public pages
 * are kept in the short cache twice as long.
 *
 * Turned on by an admin (POST /admin/spike-mode) or by SPIKE_MODE=on on Render. The admin switch
 * lives in this process's memory: a restart or deploy turns it off again, so it can never stay
 * on by mistake.
 */
@Injectable()
export class SpikeModeService {
  private manual: { on: boolean; by: number | null; at: string } | null = null;

  isOn(): boolean {
    if (this.manual) return this.manual.on;
    return String(process.env.SPIKE_MODE || '').toLowerCase() === 'on';
  }

  set(on: boolean, by: number | null): { on: boolean; source: string; at: string } {
    this.manual = { on, by, at: new Date().toISOString() };
    return this.status();
  }

  status(): { on: boolean; source: string; at: string | null } {
    if (this.manual) return { on: this.manual.on, source: 'admin', at: this.manual.at };
    return { on: this.isOn(), source: 'env', at: null };
  }
}

/** The one place to share the switch without Nest injection (cache interceptor, health page). */
export const spikeMode = new SpikeModeService();
