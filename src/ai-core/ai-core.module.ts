import { Module } from '@nestjs/common';
import { AiCoreService } from './ai-core.service';
import { AnthropicProvider } from './providers/anthropic.provider';
import { MockLlmProvider } from './providers/mock.provider';
import { AiOrchestratorService } from './orchestrator/ai-orchestrator.service';

@Module({
  providers: [
    AnthropicProvider,
    MockLlmProvider,
    AiCoreService,
    AiOrchestratorService,
  ],
  exports: [AiOrchestratorService],
})
export class AiCoreModule {}
