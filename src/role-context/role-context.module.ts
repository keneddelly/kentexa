import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountRole } from './entities/account-role.entity';
import { ActiveRoleSession } from './entities/active-role-session.entity';
import { RoleMigrationAudit } from './entities/role-migration-audit.entity';
import { User } from '../users/entities/user.entity';
import { SellerProfile } from '../seller/entities/seller-profile.entity';
import { Agent } from '../agents/entities/agent.entity';
import { SuperAgent } from '../super-agents/entities/super-agent.entity';
import { TransportProvider } from '../transport/entities/transport-provider.entity';
import { RoleContextService } from './role-context.service';
import { RoleContextGuard } from './role-context.guard';
import { CapabilityGuard } from './capability.guard';
import { ActiveRoleGuard } from './active-role.guard';

/**
 * Runtime role-context enforcement primitives: RoleContextGuard resolves the
 * caller's current session/role from the JWT and DB; ActiveRoleGuard and
 * CapabilityGuard authorize against that resolved context, never against
 * possessed-but-inactive roles. Global so every domain module can consult
 * RoleContextService/guards without individually importing this module.
 */
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      AccountRole,
      ActiveRoleSession,
      RoleMigrationAudit,
      User,
      SellerProfile,
      Agent,
      SuperAgent,
      TransportProvider,
    ]),
  ],
  providers: [RoleContextService, RoleContextGuard, CapabilityGuard, ActiveRoleGuard],
  exports: [TypeOrmModule, RoleContextService, RoleContextGuard, CapabilityGuard, ActiveRoleGuard],
})
export class RoleContextModule {}
