import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiCostLog } from './ai-cost-log.entity';
import { AnthropicProviderAdapter } from './anthropic-provider.adapter';
import { AiPromptTemplateService } from './ai-prompt-templates.service';
import { AiCacheService } from './ai-cache.service';
import { AiSafetyService } from './ai-safety.service';
import { AiCostLogService } from './ai-cost-log.service';
import { AiCoreService } from './ai-core.service';
import { AiSearchParserService } from './ai-search-parser.service';

@Module({
  imports: [TypeOrmModule.forFeature([AiCostLog])],
  providers: [
    AnthropicProviderAdapter,
    AiPromptTemplateService,
    AiCacheService,
    AiSafetyService,
    AiCostLogService,
    AiCoreService,
    AiSearchParserService,
  ],
  exports: [AiCoreService, AiPromptTemplateService, AiSearchParserService],
})
export class AiModule {}
