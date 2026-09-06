import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  Check,
} from 'typeorm';
import { Conversation } from './conversation.entity';
import { User } from '../../users/entities/user.entity';
import { AccountRole } from '../../role-context/entities/account-role.entity';
import { BusinessCustomer } from './business-customer.entity';

/**
 * Which kind of server-resolved identity this participant row represents.
 * Mirrors RoleContext's own shape (Stage 1): a participant is never
 * authorized by a client-supplied id, only by what
 * RoleContextService.resolveContext() (or an equivalent trusted server
 * lookup, e.g. BusinessCustomer for an external contact) actually resolved.
 */
export enum ParticipantPrincipalType {
  /** The raw account (User), for ACCOUNT_SCOPE participation only. */
  ACCOUNT = 'account',
  /** A specific AccountRole -- the normal case for an operational participant. */
  ACCOUNT_ROLE = 'account_role',
  /** A workspace/profile (seller_profile, agent, super_agent, transport_provider, ...) without a resolved AccountRole on hand (e.g. legacy backfill). */
  WORKSPACE = 'workspace',
  /** A non-account contact (WhatsApp/manual BusinessCustomer with no userId). */
  EXTERNAL_CONTACT = 'external_contact',
}

/** Display/semantic label -- distinct from principalType, which is the structural resolution kind. */
export enum ParticipantKind {
  SELLER = 'seller',
  BUYER = 'buyer',
  AGENT = 'agent',
  SUPER_AGENT = 'super_agent',
  TRANSPORT_PROVIDER = 'transport_provider',
  SERVICE_PROVIDER = 'service_provider',
  ASSIGNEE = 'assignee',
  SYSTEM = 'system',
  EXTERNAL = 'external',
}

export enum ParticipantStatus {
  ACTIVE = 'active',
  LEFT = 'left',
}

// "Exactly one principal target is authoritative" -- enforced at the DB
// level, not just in application code, so a bug in the resolver can never
// silently create an ambiguous row that authorization code might resolve
// two different ways depending on which field it happens to check first.
//
// Named explicitly (migration readiness pass) so a database bootstrapped
// via TypeORM `synchronize` creates this constraint under the SAME name
// the migration file's literal CREATE TABLE uses -- previously this was
// unnamed, so synchronize generated a random hash name instead, making a
// synchronize-created database look "incompatible" to any tooling that
// checked for this constraint by exact name. See
// AddCommunicationParticipantAudience's assertOnePrincipalCheckPresent()
// for the content-based fallback that still recognizes the OLD
// auto-hashed name on any database that already has one.
@Check(
  'CHK_conv_participant_one_principal',
  `
  (
    ("principalType" = 'account' AND user_id IS NOT NULL AND account_role_id IS NULL AND "workspaceType" IS NULL AND "workspaceId" IS NULL AND external_customer_id IS NULL)
    OR ("principalType" = 'account_role' AND account_role_id IS NOT NULL AND user_id IS NULL AND "workspaceType" IS NULL AND "workspaceId" IS NULL AND external_customer_id IS NULL)
    OR ("principalType" = 'workspace' AND "workspaceType" IS NOT NULL AND "workspaceId" IS NOT NULL AND user_id IS NULL AND account_role_id IS NULL AND external_customer_id IS NULL)
    OR ("principalType" = 'external_contact' AND external_customer_id IS NOT NULL AND user_id IS NULL AND account_role_id IS NULL AND "workspaceType" IS NULL AND "workspaceId" IS NULL)
  )
`,
)
// Duplicate-active-participant prevention, one partial unique index per
// principal shape (same pattern as Conversation's own partial indexes) --
// a plain multi-column UNIQUE would let unlimited NULL:NULL rows through
// for whichever columns a given principal type leaves unset.
@Index('idx_conv_participant_unique_account', ['conversationId', 'userId'], {
  unique: true,
  where: `"principalType" = 'account' AND status = 'active'`,
})
@Index('idx_conv_participant_unique_account_role', ['conversationId', 'accountRoleId'], {
  unique: true,
  where: `"principalType" = 'account_role' AND status = 'active'`,
})
@Index('idx_conv_participant_unique_workspace', ['conversationId', 'workspaceType', 'workspaceId'], {
  unique: true,
  where: `"principalType" = 'workspace' AND status = 'active'`,
})
@Index('idx_conv_participant_unique_external', ['conversationId', 'externalCustomerId'], {
  unique: true,
  where: `"principalType" = 'external_contact' AND status = 'active'`,
})
@Entity('conversation_participant')
export class ConversationParticipant {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Conversation, { eager: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversation_id' })
  conversation: Conversation;

  @Column({ name: 'conversation_id' })
  conversationId: number;

  @Column({ type: 'varchar' })
  principalType: string; // ParticipantPrincipalType

  @ManyToOne(() => User, { nullable: true, eager: false })
  @JoinColumn({ name: 'user_id' })
  user: User | null;

  @Column({ name: 'user_id', nullable: true })
  userId: number | null;

  @ManyToOne(() => AccountRole, { nullable: true, eager: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'account_role_id' })
  accountRole: AccountRole | null;

  @Column({ name: 'account_role_id', nullable: true })
  accountRoleId: number | null;

  // Plain nullable fields (not a relation) -- same pattern as
  // Conversation.commerceProfileId and RoleProfileType: the concrete table
  // is determined by workspaceType (e.g. 'seller_profile', 'agent',
  // 'super_agent', 'transport_provider').
  @Column({ type: 'varchar', nullable: true })
  workspaceType: string | null;

  @Column({ type: 'int', nullable: true })
  workspaceId: number | null;

  @ManyToOne(() => BusinessCustomer, { nullable: true, eager: false })
  @JoinColumn({ name: 'external_customer_id' })
  externalCustomer: BusinessCustomer | null;

  @Column({ name: 'external_customer_id', nullable: true })
  externalCustomerId: number | null;

  @Column({ type: 'varchar' })
  participantKind: string; // ParticipantKind

  @Column({ type: 'jsonb', default: () => "'{}'" })
  permissions: Record<string, boolean>;

  @Column({ type: 'varchar', default: ParticipantStatus.ACTIVE })
  status: string;

  @Column({ type: 'timestamp', default: () => 'now()' })
  joinedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  leftAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
