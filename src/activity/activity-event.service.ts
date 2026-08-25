import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
}
