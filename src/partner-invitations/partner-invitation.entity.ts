import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';
import { SuperAgent } from '../super-agents/entities/super-agent.entity';
import { User } from '../users/entities/user.entity';
import { Parcel } from '../super-agents/entities/parcel.entity';

/**
 * Partner invitations (owner 2026-10-21, NEXT_STEPS §13 item 3). A Super Agent invites a
 * transport provider or another hub to join KenteXa through a real waybill, so the
 * partner's first job is a real shipment. The invite goes out by WhatsApp or the
 * sender's own SMS, never KenteXa's SMS. Joining is only an application: normal admin
 * approval still applies, and the waybill is never assigned automatically.
 *
 * Statuses: sent → opened (link viewed) → joined (role application submitted) →
 * confirmed (the inviting Super Agent confirms the person). sent/opened become expired
 * after 7 days. Migration 1792100000000-AddPartnerInvitation.
 */
export enum PartnerInvitationStatus {
  SENT = 'sent',
  OPENED = 'opened',
  JOINED = 'joined',
  CONFIRMED = 'confirmed',
  EXPIRED = 'expired',
}

/** Transport and hubs only for now (no street agents yet). Values match AccountRoleType. */
export enum PartnerInvitationRole {
  TRANSPORT_PROVIDER = 'transport_provider',
  SUPER_AGENT = 'super_agent',
}

export enum PartnerInvitationChannel {
  WHATSAPP = 'whatsapp',
  OWN_SMS = 'own_sms',
}

@Entity('partner_invitation')
@Index('IDX_partner_invitation_inviter_status', ['invitedBySuperAgentId', 'status'])
export class PartnerInvitation {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => SuperAgent, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'invitedBySuperAgentId' })
  invitedBySuperAgent: SuperAgent;

  @Column({ type: 'int' })
  invitedBySuperAgentId: number;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'invitedByUserId' })
  invitedByUser: User | null;

  @Column({ type: 'int', nullable: true })
  invitedByUserId: number | null;

  @ManyToOne(() => Parcel, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'parcelId' })
  parcel: Parcel;

  @Column({ type: 'int' })
  parcelId: number;

  // Copy of the parcel's waybill at invite time, shown on the join page.
  @Column({ type: 'varchar', length: 16 })
  waybillNumber: string;

  // 255XXXXXXXXX (normalizeTzPhone)
  @Column({ type: 'varchar', length: 20 })
  invitedPhone: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  invitedName: string | null;

  @Column({ type: 'enum', enum: PartnerInvitationRole, enumName: 'partner_invitation_role_enum' })
  roleOffered: PartnerInvitationRole;

  @Column({ type: 'enum', enum: PartnerInvitationChannel, enumName: 'partner_invitation_channel_enum' })
  channel: PartnerInvitationChannel;

  // sha256 of the signed link token; the token itself is never stored.
  @Column({ type: 'varchar', length: 64, unique: true })
  tokenHash: string;

  @Column({
    type: 'enum', enum: PartnerInvitationStatus, enumName: 'partner_invitation_status_enum',
    default: PartnerInvitationStatus.SENT,
  })
  status: PartnerInvitationStatus;

  @Column({ type: 'timestamp' })
  expiresAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  openedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  joinedAt: Date | null;

  // The account that accepted the link (set at accept, before the application).
  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'joinedUserId' })
  joinedUser: User | null;

  @Column({ type: 'int', nullable: true })
  joinedUserId: number | null;

  // The submitted application: transport_provider.id or super_agent.id, per roleOffered.
  // (An account_role row only exists after admin approval, so it cannot be used here.)
  @Column({ type: 'int', nullable: true })
  joinedApplicationId: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
