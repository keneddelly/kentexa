import { Global, Module } from '@nestjs/common';
import { OwnershipFeatureFlagsService } from './ownership-feature-flags.service';

/**
 * Global so every module touching a Business-First Stage 2 migrated
 * resource (Product, Classified, ...) can check a rollout flag without a
 * new import edge just for a stateless env-var reader.
 */
@Global()
@Module({
  providers: [OwnershipFeatureFlagsService],
  exports: [OwnershipFeatureFlagsService],
})
export class OwnershipFeatureFlagsModule {}
