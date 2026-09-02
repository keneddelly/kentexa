import { Module } from '@nestjs/common';
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

/** Phase A persistence registration; no runtime role-context enforcement. */
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
  providers: [RoleContextService, RoleContextGuard, CapabilityGuard],
  exports: [TypeOrmModule, RoleContextService, RoleContextGuard, CapabilityGuard],
})
export class RoleContextModule {}
