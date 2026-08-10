import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiUsageLog, AiUsageStatus } from './entities/ai-usage-log.entity';
import { estimateCost } from './ai-cost-table';

export interface UsageLogEntry {
  task: string;
  userId?: number | null;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  latencyMs: number;
  status: AiUsageStatus;
}

export interface UsageSummaryRow {
  provider: string;
  model: string;
  task: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  avgLatencyMs: number;
  errorCount: number;
  fallbackCount: number;
}

@Injectable()
export class AiUsageLogService {
  private readonly logger = new Logger(AiUsageLogService.name);

  constructor(
    @InjectRepository(AiUsageLog) private repo: Repository<AiUsageLog>,
  ) {}

  // Fire-and-forget — a logging failure must never break the calling workflow.
  // Never receives prompt text — only token counts and metadata.
  async record(entry: UsageLogEntry): Promise<void> {
    try {
      await this.repo.save(
        this.repo.create({
          task: entry.task,
          userId: entry.userId ?? null,
          provider: entry.provider,
          model: entry.model,
          inputTokens: entry.inputTokens,
          outputTokens: entry.outputTokens,
          cacheReadTokens: entry.cacheReadTokens ?? 0,
          estimatedCost: estimateCost(
            entry.provider,
            entry.model,
            entry.inputTokens,
            entry.outputTokens,
          ),
          latencyMs: entry.latencyMs,
          status: entry.status,
        }),
      );
    } catch (err) {
      this.logger.warn(`Failed to record AI usage log: ${err.message}`);
    }
  }

  async getUsageSummary(sinceDays = 30): Promise<UsageSummaryRow[]> {
    const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
    const rows = await this.repo
      .createQueryBuilder('log')
      .select('log.provider', 'provider')
      .addSelect('log.model', 'model')
      .addSelect('log.task', 'task')
      .addSelect('COUNT(*)', 'requests')
      .addSelect('SUM(log.inputTokens)', 'inputTokens')
      .addSelect('SUM(log.outputTokens)', 'outputTokens')
      .addSelect('SUM(log.estimatedCost)', 'estimatedCost')
      .addSelect('AVG(log.latencyMs)', 'avgLatencyMs')
      .addSelect(
        `SUM(CASE WHEN log.status = 'error' THEN 1 ELSE 0 END)`,
        'errorCount',
      )
      .addSelect(
        `SUM(CASE WHEN log.status = 'fallback' THEN 1 ELSE 0 END)`,
        'fallbackCount',
      )
      .where('log.createdAt >= :since', { since })
      .groupBy('log.provider')
      .addGroupBy('log.model')
      .addGroupBy('log.task')
      .orderBy('SUM(log.estimatedCost)', 'DESC')
      .getRawMany();

    return rows.map((r) => ({
      provider: r.provider,
      model: r.model,
      task: r.task,
      requests: Number(r.requests),
      inputTokens: Number(r.inputTokens),
      outputTokens: Number(r.outputTokens),
      estimatedCost: Number(r.estimatedCost),
      avgLatencyMs: Math.round(Number(r.avgLatencyMs)),
      errorCount: Number(r.errorCount),
      fallbackCount: Number(r.fallbackCount),
    }));
  }
}
