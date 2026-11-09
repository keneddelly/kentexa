import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { Business } from './business.entity';
import { User } from '../../users/entities/user.entity';

export enum InstagramBusinessConnectionStatus {
  ACTIVE = 'active',
  REAUTH_REQUIRED = 'reauth_required',
  DISCONNECTED = 'disconnected',
}

/**
 * One Instagram professional account connection per Kentexa Business.
 * Access tokens are stored only as authenticated ciphertext (AES-256-GCM);
 * plaintext tokens must never be persisted or returned from API responses.
 */
@Entity('instagram_business_connection')
@Index('UQ_instagram_connection_business_account', ['businessId', 'instagramUserId'], { unique: true })
@Index('IDX_instagram_connection_business_status', ['businessId', 'status'])
export class InstagramBusinessConnection {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Business, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'businessId' })
  business: Business;

  @Column({ type: 'int' })
  businessId: number;

  @Column({ type: 'varchar', length: 128 })
  instagramUserId: string;

  @Column({ type: 'varchar', length:  255 })
  instagramUsername: string;

  @Column({ type: 'text', nullable: true, select: false })
  accessTokenEncrypted: string | null;

  @Column({ type: 'timestamp', nullable: true })
  tokenExpiresAt: Date | null;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  grantedScopes: string[];

  @Column({ type: 'enum', enum: InstagramBusinessConnectionStatus, default: InstagramBusinessConnectionStatus.ACTIVE })
  status: InstagramBusinessConnectionStatus;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'connectedByUserId' })
  connectedByUser: User | null;

  @Column({ type: 'int', nullable: true })
  connectedByUserId: number | null;

  @Column({ type: 'timestamp', nullable: true })
  connectedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  lastVerifiedAt: Date | null;

  @Column({ type: 'boolean', default: false })
  webhookSubscribed: boolean;

  // Facebook Login works through the Page linked to the Instagram account (migration
  // 1795400000000): accessTokenEncrypted holds that Page's access token, which messages are sent
  // and the webhook is subscribed with.
  @Column({ type: 'varchar', length: 128, nullable: true })
  facebookPageId: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  facebookPageName: string | null;

  /** Why Meta refused the message subscription (Meta's own short message), when it did. */
  @Column({ type: 'varchar', length: 300, nullable: true })
  webhookError: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
