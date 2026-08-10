import { Controller, Get, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { AiRouter, AiTask } from './ai.router';
import { AiUsageLogService } from './ai-usage-log.service';

const ALL_TASKS: AiTask[] = [
  'moderation',
  'summary',
  'reply-draft',
  'product-listing',
  'search-parse',
];

// Admin-only visibility into the hybrid AI system — which providers are
// registered, which provider/model currently handles each task, and what
// it's costing. Never returns key material. No mutation endpoints yet —
// routing is configured via env vars/redeploy for now; this stays
// read-only until a DB-backed override is actually needed.
@Controller('admin/ai')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AiController {
  constructor(
    private router: AiRouter,
    private usageLog: AiUsageLogService,
  ) {}

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Get('status')
  getStatus() {
    const providers = this.router.listProviders();
    const routing = ALL_TASKS.map((task) => {
      try {
        const route = this.router.resolve(task);
        return {
          task,
          tier: route.tier,
          provider: route.provider.name,
          model: route.model,
          fallbackProvider: route.fallback?.name ?? null,
          fallbackModel: route.fallbackModel,
        };
      } catch (err) {
        return { task, error: err.message };
      }
    });
    return { providers, routing };
  }

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Get('usage')
  async getUsage() {
    const summary = await this.usageLog.getUsageSummary(30);
    return { rangeDays: 30, summary };
  }
}
