import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { User } from '../../users/entities/user.entity';

/** Instagram professional account connected by a Kentexa seller. Tokens are encrypted before persistence. */
@Entity('instagram_business_connection')
@Index('UQ_instagram_connection_account', ['instagramUserId'], { unique: true })
export class InstagramBusinessConnection {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, { eager: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'seller_id' })
  seller: User;

  @Column({ name: 'seller_id', type: 'int' })
  sellerId: number;

  @Column({ name: 'instagram_user_id', type: 'varchar', length: 100 })
  instagramUserId: string;

  @Column({ name: 'instagram_username', type: 'varchar', length: 150, nullable: true })
  instagramUsername: string | null;

  @Column({ name: 'access_token_encrypted', type: 'text' })
  accessTokenEncrypted: string;

  @Column({ name: 'token_expires_at', type: 'timestamp', nullable: true })
  tokenExpiresAt: Date | null;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  scopes: string[];

  @Column({ type: 'varchar', length: 20, default: 'connected' })
  status: string;

  @Column({ name: 'connected_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  connectedAt: Date;

  @Column({ name: 'last_synced_at', type: 'timestamp', nullable: true })
  lastSyncedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
