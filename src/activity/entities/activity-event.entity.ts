import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

// The full taxonomy from CLAUDE.md's Activity Event System, even though
// only a subset of categories are actually emitted in this phase
// (Commerce + Business) — declaring the whole enum now means later phases
// (Logistics, Agent, Auth, Verification, ...) never need a migration just
// to add a category.
export enum ActivityCategory {
  AUTH = 'AUTH',
  IDENTITY = 'IDENTITY',
  BUSINESS = 'BUSINESS',
  SOCIAL = 'SOCIAL',
  CONTENT = 'CONTENT',
  SEARCH = 'SEARCH',
  MESSAGING = 'MESSAGING',
  COMMERCE = 'COMMERCE',
  PAYMENT = 'PAYMENT',
  INVOICE = 'INVOICE',
  LOGISTICS = 'LOGISTICS',
  AGENT = 'AGENT',
  TRANSPORT = 'TRANSPORT',
  VERIFICATION = 'VERIFICATION',
  REPUTATION = 'REPUTATION',
  SECURITY = 'SECURITY',
  SYSTEM = 'SYSTEM',
  AI = 'AI',
}

// Append-only, same posture as AuditLog (src/audit-log/) — rows are never
// updated or deleted. Distinct purpose though: AuditLog is the admin/
// security "who changed what" record; this is the identity-aware domain-
// event bus CLAUDE.md's Internal AI Intelligence section calls for —
// structured activity meant to eventually feed business/admin
// intelligence reports, not just an audit trail. Also distinct from
// AnalyticsEvent (src/analytics/), which captures frontend browsing
// behavior (page views/clicks/scroll), not server-side domain actions.
@Entity('activity_events')
export class ActivityEvent {
  @PrimaryGeneratedColumn()
  id: number;

  // e.g. 'ORDER_CREATED', 'INVOICE_PAID', 'PROFILE_FOLLOWED'. Free-form
  // varchar, not an enum — same reasoning as AuditLog.action: the set of
  // event types will grow steadily as more modules adopt this, and a
  // giant enum would only get out of sync with reality.
  @Index()
  @Column({ type: 'varchar' })
  eventType: string;

  @Index()
  @Column({ type: 'enum', enum: ActivityCategory })
  category: ActivityCategory;

  // Null for system-initiated events (crons, automated status changes).
  @Index()
  @Column({ type: 'int', nullable: true })
  actorId: number | null;

  @Column({ type: 'varchar', nullable: true })
  actorType: string | null;

  // Which CommerceProfile the actor was operating AS when they performed
  // this action — distinct from actorId (the raw account). An account
  // running both a Personal profile and a Business has one actorId either
  // way; without this, the AI intelligence layer can't tell "Kennedy
  // personally did X" from "Bishoo Intelligence Systems did X." Null for
  // events emitted before this column existed, or where the emitting call
  // site doesn't yet know which profile was active (most don't yet —
  // profile-architecture-audit-2026-08 flagged this as a real gap, not
  // wired up broadly, just declared here so later phases don't need a
  // migration to add it).
  @Column({ type: 'int', nullable: true })
  actorProfileId: number | null;

  @Column({ type: 'varchar', nullable: true })
  actorProfileType: string | null;

  // The CommerceProfile/Business identity this activity belongs to — the
  // aggregation key CLAUDE.md section 9 asks for ("Business X received 43
  // customer interactions", not per-product noise).
  @Index()
  @Column({ type: 'int', nullable: true })
  businessId: number | null;

  @Column({ type: 'varchar', nullable: true })
  targetType: string | null;

  @Column({ type: 'int', nullable: true })
  targetId: number | null;

  @Column({ type: 'int', nullable: true })
  relatedUserId: number | null;

  @Column({ type: 'int', nullable: true })
  relatedBusinessId: number | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any> | null;

  @Column({ type: 'varchar', nullable: true })
  sessionId: string | null;

  @Column({ type: 'varchar', nullable: true })
  requestId: string | null;

  @Column({ type: 'varchar', default: 'info' })
  severity: string;

  // Who this activity is meant to be shown to, once a report/dashboard
  // consumes it: 'business' (the identity it belongs to), 'admin', or
  // 'system' (internal only, e.g. future AI_EVENT/AI_ACTION rows).
  @Column({ type: 'varchar', default: 'business' })
  visibility: string;

  @CreateDateColumn()
  @Index()
  createdAt: Date;
}
