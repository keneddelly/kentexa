import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiCostLog } from './ai-cost-log.entity';

export interface CostLogEntry {
  workflow: string;
  userId?: number | null;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
}

@Injectable()
export class AiCostLogService {
  private readonly logger = new Logger(AiCostLogService.name);

  constructor(
    @InjectRepository(AiCostLog) private repo: Repository<AiCostLog>,
  ) {}

  // Fire-and-forget — a logging failure must never break the calling workflow.
  async record(entry: CostLogEntry): Promise<void> {
    try {
      await this.repo.save(
        this.repo.create({
          workflow: entry.workflow,
          userId: entry.userId ?? null,
          model: entry.model,
          inputTokens: entry.inputTokens,
          outputTokens: entry.outputTokens,
          cacheReadTokens: entry.cacheReadTokens ?? 0,
        }),
      );
    } catch (err) {
      this.logger.warn(`Failed to record AI cost log: ${err.message}`);
    }
  }
}
