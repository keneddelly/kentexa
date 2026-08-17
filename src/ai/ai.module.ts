import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
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

@Module({
  imports: [TypeOrmModule.forFeature([AiUsageLog])],
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
  ],
  exports: [AiService, AiPromptTemplateService, AiSearchParserService, AiSearchExplainerService],
})
export class AiModule {}
