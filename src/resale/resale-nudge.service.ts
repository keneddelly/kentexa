import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { InAppNotificationService } from '../notifications/in-app-notification.service';

/**
 * "Uza tena" reminder (owner 2026-11-10, growth plan): a person who joined a day ago and has not
 * made an offer yet gets one notification pointing to the products to resell. Sent once
 * (resale_member."nudgedAt"); people who joined more than 2 days ago are never reminded late.
 */
export const NUDGE_SQL = `
  UPDATE public.resale_member m SET "nudgedAt" = now()
   WHERE m."isActive" = true AND m."rulesAcceptedAt" IS NOT NULL AND m."nudgedAt" IS NULL
     AND m."rulesAcceptedAt" <= now() - interval '24 hours'
     AND m."rulesAcceptedAt" >  now() - interval '48 hours'
     AND NOT EXISTS (SELECT 1 FROM public.resale_offer o WHERE o."resellerUserId" = m."userId")
  RETURNING m."userId"`;

@Injectable()
export class ResaleNudgeService {
  private readonly logger = new Logger(ResaleNudgeService.name);

  constructor(private readonly db: DataSource, @Optional() private readonly notifier?: InAppNotificationService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async remind(): Promise<number> {
    let rows: Array<{ userId: number }> = [];
    try { rows = await this.db.query(NUDGE_SQL); } catch { return 0; } // before the migration ran
    for (const r of rows) {
      await this.notifier?.notify({
        userId: Number(r.userId),
        type: 'resale_nudge',
        title: 'Chagua bidhaa ya kwanza ya kuuza',
        body: 'Umejiunga na Uza tena. Chagua bidhaa, weka bei yako na shiriki kwenye WhatsApp Status: duka linafikisha na linakulipa faida.',
        actionPage: 'MyResales',
        sourceType: 'resale_member',
        sourceId: Number(r.userId),
      }).catch(() => undefined);
    }
    if (rows.length) this.logger.log(`Uza tena reminder sent to ${rows.length}`);
    return rows.length;
  }
}
