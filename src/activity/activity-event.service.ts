import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { ActivityEvent, ActivityCategory } from './entities/activity-event.entity';

export interface RecordActivityParams {
  eventType: string;
  category: ActivityCategory;
  actorId?: number | null;
  actorType?: string | null;
  businessId?: number | null;
  targetType?: string | null;
  targetId?: number | null;
  relatedUserId?: number | null;
  relatedBusinessId?: number | null;
  metadata?: Record<string, any> | null;
  sessionId?: string | null;
  requestId?: string | null;
  severity?: string;
  visibility?: string;
}

// Layer 1 of CLAUDE.md's layered intelligence architecture (Event
// collection -> Deterministic analytics -> Rules -> AI reasoning) —
// this service is ONLY layer 1. No correlation, no pattern detection, no
// AI here; it just writes the row. Fire-and-forget, same non-fatal
// convention as AuditLogService.record()/SearchIndexService.upsert(): a
// logging failure must never break the real operation that triggered it,
// so record() never throws.
@Injectable()
export class ActivityEventService {
  private readonly logger = new Logger(ActivityEventService.name);

  constructor(
    @InjectRepository(ActivityEvent) private repo: Repository<ActivityEvent>,
  ) {}

  async record(params: RecordActivityParams): Promise<void> {
    try {
      await this.repo.save(
        this.repo.create({
          eventType: params.eventType,
          category: params.category,
          actorId: params.actorId ?? null,
          actorType: params.actorType ?? null,
          businessId: params.businessId ?? null,
          targetType: params.targetType ?? null,
          targetId: params.targetId ?? null,
          relatedUserId: params.relatedUserId ?? null,
          relatedBusinessId: params.relatedBusinessId ?? null,
          metadata: params.metadata ?? null,
          sessionId: params.sessionId ?? null,
          requestId: params.requestId ?? null,
          severity: params.severity ?? 'info',
          visibility: params.visibility ?? 'business',
        }),
      );
    } catch (err) {
      this.logger.warn(
        `Failed to record activity event ${params.eventType}: ${err.message}`,
      );
    }
  }

  async findRecent(limit = 50): Promise<ActivityEvent[]> {
    return this.repo.find({
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  // Layer 2 building block — deterministic count of a specific event type
  // for one business identity since a given time. Used by
  // BusinessService.getTodayIntelligence() rather than exposing the raw
  // repo to other modules, keeping ActivityEvent access centralized here.
  async countSince(
    businessId: number,
    eventType: string,
    since: Date,
  ): Promise<number> {
    return this.repo.count({
      where: { businessId, eventType, createdAt: MoreThanOrEqual(since) },
    });
  }

  // Layer 2 building block for AdminIntelligenceService's "fast-growing
  // businesses" — the query that could not exist before this event bus:
  // which identities had the most activity in a period, across every
  // category (commerce, logistics, agent, social...) at once.
  async topBusinessesSince(
    since: Date,
    limit = 5,
  ): Promise<{ businessId: number; count: number }[]> {
    const rows = await this.repo
      .createQueryBuilder('e')
      .select('e."businessId"', 'businessId')
      .addSelect('COUNT(*)', 'count')
      .where('e."businessId" IS NOT NULL')
      .andWhere('e."createdAt" >= :since', { since })
      .groupBy('e."businessId"')
      .orderBy('count', 'DESC')
      .limit(limit)
      .getRawMany();
    return rows.map((r) => ({
      businessId: Number(r.businessId),
      count: Number(r.count),
    }));
  }
}
