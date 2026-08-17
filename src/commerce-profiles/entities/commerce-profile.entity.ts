import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

// One User -> many CommerceProfiles. A role (activeRoles on User) only ever
// gates whether someone is ALLOWED to create/manage a profile of a given
// type — it must never be read to decide what's shown publicly. That
// conflation (role driving public display) is exactly the bug this entity
// exists to remove: the profile header was flipping between a seller's
// store brand and a transport company's brand based on which role the
// account happened to have approved most recently, not on which identity
// a visitor actually came to see.
export enum CommerceProfileType {
  PERSONAL = 'personal',
  BUSINESS = 'business',
  SERVICE_PROVIDER = 'service_provider',
  AGENT = 'agent',
  TRANSPORT_PROVIDER = 'transport_provider',
  HUB = 'hub',
}

export enum CommerceProfileStatus {
  ACTIVE = 'active',
  PENDING = 'pending',
  SUSPENDED = 'suspended',
  REJECTED = 'rejected',
}

@Entity('commerce_profile')
export class CommerceProfile {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, { eager: false })
  @JoinColumn()
  owner: User;

  @Column()
  ownerId: number;

  @Column({ type: 'enum', enum: CommerceProfileType })
  type: CommerceProfileType;

  // The public handle — "bishoo", not "@bishoo". Unique across ALL profile
  // types in one namespace (personal and business handles share the same
  // pool), matching how Instagram/Twitter handles work.
  @Column({ unique: true })
  username: string;

  @Column()
  displayName: string;

  @Column({ type: 'varchar', nullable: true })
  photoUrl: string | null;

  @Column({ type: 'varchar', nullable: true })
  coverImage: string | null;

  @Column({ type: 'text', nullable: true })
  bio: string | null;

  @Column({ type: 'varchar', nullable: true })
  location: string | null;

  @Column({ type: 'varchar', nullable: true })
  category: string | null;

  @Column({
    type: 'enum',
    enum: CommerceProfileStatus,
    default: CommerceProfileStatus.ACTIVE,
  })
  status: CommerceProfileStatus;

  // Profile-level verification — deliberately separate from User.isVerified
  // (personal identity verification). A verified person can operate an
  // unverified, newly-pending business; never let one imply the other.
  @Column({ default: false })
  isVerified: boolean;

  // Denormalized — kept in sync by the services that own Follow/Review
  // writes for this profile. Source of truth is always the underlying
  // Follow/Review rows scoped by commerceProfileId.
  @Column({ type: 'int', default: 0 })
  followersCount: number;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0 })
  rating: number;

  @Column({ type: 'int', default: 0 })
  reviewsCount: number;

  @Column({ type: 'int', default: 0 })
  reputationScore: number;

  // AI-extracted structured metadata (keywords/useCases/impliedCategories),
  // distinct from the raw embedding vector in search_embeddings — populated
  // by AiSellerEnrichmentService whenever bio/category/listings change.
  // Feeds both the embedding text builder and SellerRankingService.
  @Column({ type: 'text', nullable: true })
  aiKeywords: string | null;

  // Which operational record backs this profile's role-specific data —
  // at most one of these is set, matching `type`. Kept as plain nullable
  // ids (not relations) so this entity has zero import-time coupling to
  // the seller/transport/agent/super-agent modules.
  @Column({ type: 'int', nullable: true })
  sellerProfileId: number | null;

  @Column({ type: 'int', nullable: true })
  transportProviderId: number | null;

  @Column({ type: 'int', nullable: true })
  agentId: number | null;

  @Column({ type: 'int', nullable: true })
  superAgentId: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
