import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActivityEvent } from './entities/activity-event.entity';

export interface RecordActivityInput {
  eventType: string;
  eventCategory: ActivityEvent['eventCategory'];
  actorId?: number | null;
  actorType?: ActivityEvent['actorType'];
  businessId?: number | null;
  targetType?: string | null;
  targetId?: number | null;
  relatedUserId?: number | null;
  relatedBusinessId?: number | null;
  location?: Record<string, any> | null;
  source: string;
  metadata?: Record<string, any> | null;
  sessionId?: string | null;
  requestId?: string | null;
  severity?: ActivityEvent['severity'];
  visibility?: ActivityEvent['visibility'];
}

interface DateRange {
  from?: string;
  to?: string;
}

@Injectable()
export class ActivityService {
  constructor(
    @InjectRepository(ActivityEvent)
    private readonly repo: Repository<ActivityEvent>,
  ) {}

  async record(input: RecordActivityInput): Promise<ActivityEvent> {
    const event = this.repo.create(input);
    return this.repo.save(event);
  }

  private resolveRange(range: DateRange) {
    const from = range.from
      ? new Date(range.from)
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const to = range.to ? new Date(range.to) : new Date();
    return { from, to };
  }

  async getBusinessSummary(businessId: number, range: DateRange) {
    const { from, to } = this.resolveRange(range);

    const byCategory = await this.repo
      .createQueryBuilder('e')
      .select('e.eventCategory', 'category')
      .addSelect('COUNT(*)', 'count')
      .where('e.businessId = :businessId', { businessId })
      .andWhere('e.timestamp BETWEEN :from AND :to', { from, to })
      .groupBy('e.eventCategory')
      .getRawMany();

    const byEventType = await this.repo
      .createQueryBuilder('e')
      .select('e.eventType', 'eventType')
      .addSelect('COUNT(*)', 'count')
      .where('e.businessId = :businessId', { businessId })
      .andWhere('e.timestamp BETWEEN :from AND :to', { from, to })
      .groupBy('e.eventType')
      .orderBy('count', 'DESC')
      .limit(20)
      .getRawMany();

    const uniqueCustomers = await this.repo
      .createQueryBuilder('e')
      .select('COUNT(DISTINCT e.relatedUserId)', 'count')
      .where('e.businessId = :businessId', { businessId })
      .andWhere('e.timestamp BETWEEN :from AND :to', { from, to })
      .andWhere('e.relatedUserId IS NOT NULL')
      .getRawOne();

    return {
      businessId,
      range: { from, to },
      totalEvents: byCategory.reduce((sum, r) => sum + Number(r.count), 0),
      byCategory,
      byEventType,
      uniqueCustomers: Number(uniqueCustomers?.count || 0),
      note: 'Revenue and order-status figures are not derived here — see /orders and /payments for source-of-truth financial data.',
    };
  }

  async getAdminDashboard(range: DateRange) {
    const { from, to } = this.resolveRange(range);

    const byCategory = await this.repo
      .createQueryBuilder('e')
      .select('e.eventCategory', 'category')
      .addSelect('COUNT(*)', 'count')
      .where('e.timestamp BETWEEN :from AND :to', { from, to })
      .groupBy('e.eventCategory')
      .getRawMany();

    const byEventType = await this.repo
      .createQueryBuilder('e')
      .select('e.eventType', 'eventType')
      .addSelect('COUNT(*)', 'count')
      .where('e.timestamp BETWEEN :from AND :to', { from, to })
      .groupBy('e.eventType')
      .orderBy('count', 'DESC')
      .limit(20)
      .getRawMany();

    const mostActiveBusinesses = await this.repo
      .createQueryBuilder('e')
      .select('e.businessId', 'businessId')
      .addSelect('COUNT(*)', 'count')
      .where('e.timestamp BETWEEN :from AND :to', { from, to })
      .andWhere('e.businessId IS NOT NULL')
      .groupBy('e.businessId')
      .orderBy('count', 'DESC')
      .limit(20)
      .getRawMany();

    return {
      range: { from, to },
      totalEvents: byCategory.reduce((sum, r) => sum + Number(r.count), 0),
      byCategory,
      byEventType,
      mostActiveBusinesses,
      note: 'Revenue and order-status figures are not derived here — see /orders and /payments for source-of-truth financial data.',
    };
  }
}
