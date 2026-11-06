import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('instagram_oauth_state')
@Index('UQ_instagram_oauth_state_hash', ['stateHash'], { unique: true })
export class InstagramOAuthState {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 64 })
  stateHash: string;

  @Column({ type: 'int' })
  businessId: number;

  @Column({ type: 'int' })
  userId: number;

  @Column({ type: 'timestamp' })
  expiresAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  consumedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
