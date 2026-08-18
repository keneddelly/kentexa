import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TzLocationModule } from '../tz-location/tz-location.module';
import { AiUsageLog } from './entities/ai-usage-log.entity';
import { AnthropicProvider } from './providers/anthropic.provider';
import { OpenAiProvider } from './providers/openai.provider';
import { DeepSeekProvider } from './providers/deepseek.provider';
import { QwenProvider } from './providers/qwen.provider';
import { AiRouter } from './ai.router';
import { AiPromptTemplateService } from './ai-prompt-templates.service';
import { AiCacheService } from './ai-cache.service';
import { AiSafetyService } from './ai-safety.service';
import { AiUsageLogService } from './ai-usage-log.service';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { AiSearchParserService } from './ai-search-parser.service';
import { AiSearchExplainerService } from './ai-search-explainer.service';
import { AiSellerEnrichmentService } from './ai-seller-enrichment.service';
import { AiListingDescriptionService } from './ai-listing-description.service';
import { EmbeddingService } from './embedding.service';
import { EmbeddingRouter } from './embedding.router';
import { OpenAiEmbeddingProvider } from './providers/openai-embedding.provider';

@Module({
  imports: [TypeOrmModule.forFeature([AiUsageLog]), TzLocationModule],
  controllers: [AiController],
  providers: [
    AnthropicProvider,
    OpenAiProvider,
    DeepSeekProvider,
    QwenProvider,
    AiRouter,
    AiPromptTemplateService,
    AiCacheService,
    AiSafetyService,
    AiUsageLogService,
    AiService,
    AiSearchParserService,
    AiSearchExplainerService,
    AiSellerEnrichmentService,
    AiListingDescriptionService,
    OpenAiEmbeddingProvider,
    EmbeddingRouter,
    EmbeddingService,
  ],
  exports: [
    AiService,
    AiPromptTemplateService,
    AiSearchParserService,
    AiSearchExplainerService,
    AiSellerEnrichmentService,
    AiListingDescriptionService,
    EmbeddingService,
  ],
})
export class AiModule {}
