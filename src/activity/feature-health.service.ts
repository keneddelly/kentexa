import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { ActivityEventService } from './activity-event.service';
import { ActivityCategory } from './entities/activity-event.entity';
import { evaluateFeature, FEATURE_TABLES, FeatureHealth, HEALTH_FEATURES, HealthFeature, TableCheck } from './feature-health';

/**
 * Error Watch, slice 4: checks each feature every 15 minutes against the live database
 * (tables exist, mapped columns exist). Records a FEATURE_HEALTH event only when a feature
 * changes state, so the admin sees failures and recoveries, not 96 identical rows a day.
 * Never throws; never writes business data.
 */
@Injectable()
export class FeatureHealthService {
  private readonly logger = new Logger(FeatureHealthService.name);
  private lastStatus = new Map<HealthFeature, boolean>();

  constructor(
    private readonly dataSource: DataSource,
    private readonly events: ActivityEventService,
  ) {}

  @Cron('*/15 * * * *', { name: 'feature-health' })
  async runScheduled(): Promise<void> {
    await this.runOnce();
  }

  async runOnce(): Promise<FeatureHealth[]> {
    const results: FeatureHealth[] = [];
    for (const feature of HEALTH_FEATURES) {
      try {
        const checks = await this.checkTables(FEATURE_TABLES[feature]);
        results.push(evaluateFeature(feature, checks));
      } catch (err) {
        results.push({ feature, healthy: false, reason: `check failed: ${String((err as Error)?.message || err).slice(0, 200)}` });
      }
    }
    for (const result of results) this.recordIfChanged(result);
    return results;
  }

  private async checkTables(tables: string[]): Promise<TableCheck[]> {
    const checks: TableCheck[] = [];
    for (const table of tables) {
      const meta = this.dataSource.entityMetadatas.find((m) => m.tableName === table);
      if (!meta) {
        checks.push({ table, tableExists: false, expectedColumns: [], missingColumns: [] });
        continue;
      }
      const expected = meta.columns.map((c) => c.databaseName);
      const rows: { column_name: string }[] = await this.dataSource.query(
        `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
        [table],
      );
      const present = new Set(rows.map((r) => r.column_name));
      checks.push({
        table,
        tableExists: rows.length > 0,
        expectedColumns: expected,
        missingColumns: expected.filter((col) => !present.has(col)),
      });
    }
    return checks;
  }

  private recordIfChanged(result: FeatureHealth): void {
    const previous = this.lastStatus.get(result.feature);
    this.lastStatus.set(result.feature, result.healthy);
    if (previous === result.healthy) return;
    this.events.record({
      eventType: 'FEATURE_HEALTH',
      category: ActivityCategory.SYSTEM,
      targetType: 'feature',
      metadata: { feature: result.feature, status: result.healthy ? 'healthy' : 'failing', reason: result.reason },
      severity: result.healthy ? 'info' : 'error',
      visibility: 'system',
    }).catch(() => undefined);
    if (!result.healthy) this.logger.warn(`Feature ${result.feature} failing: ${result.reason}`);
  }
}
