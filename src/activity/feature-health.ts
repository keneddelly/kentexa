/**
 * Error Watch, slice 4: the features the self-check covers, and the pure rule that
 * decides whether one is healthy. Read-only: nothing here writes to the database.
 */
export const HEALTH_FEATURES = ['publish', 'feed', 'messaging', 'alerts', 'commerce'] as const;
export type HealthFeature = (typeof HEALTH_FEATURES)[number];

/** Table names each feature reads and writes, as listed in the entity metadata. */
export const FEATURE_TABLES: Record<HealthFeature, string[]> = {
  publish: ['business_feed_item'],
  feed: ['business_feed_item'],
  messaging: ['conversation_message'],
  alerts: ['push_subscription'],
  commerce: ['commerce_profile'],
};

export interface TableCheck {
  table: string;
  tableExists: boolean;
  expectedColumns: string[];
  missingColumns: string[];
}

export interface FeatureHealth {
  feature: HealthFeature;
  healthy: boolean;
  reason: string;
}

/** Healthy only when every table exists and every column the code maps is in the database. */
export function evaluateFeature(feature: HealthFeature, checks: TableCheck[]): FeatureHealth {
  const missingTable = checks.find((c) => !c.tableExists);
  if (missingTable) {
    return { feature, healthy: false, reason: `table ${missingTable.table} is missing` };
  }
  const missing = checks.flatMap((c) => c.missingColumns.map((col) => `${c.table}.${col}`));
  if (missing.length) {
    return { feature, healthy: false, reason: `column ${missing.slice(0, 5).join(', ')} is missing (migration not run?)` };
  }
  return { feature, healthy: true, reason: 'ok' };
}
