import { Global, Module } from '@nestjs/common';
import { CommunicationFeatureFlagsService } from './communication-feature-flags.service';

/**
 * Global so every module touching conversations/notifications/communication
 * logs can check a Stage 2 rollout flag without a new import edge just for
 * a stateless env-var reader.
 */
@Global()
@Module({
  providers: [CommunicationFeatureFlagsService],
  exports: [CommunicationFeatureFlagsService],
})
export class CommunicationFeatureFlagsModule {}
