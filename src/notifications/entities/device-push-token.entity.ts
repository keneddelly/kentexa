/**
 * DevicePushToken — a native phone's Firebase Cloud Messaging token.
 * One row per device token; a token belongs to the user who signed in on it.
 */
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('device_push_token')
export class DevicePushToken {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  userId: number;

  @Column({ type: 'varchar', unique: true })
  token: string;

  @Column({ type: 'varchar', length: 16 })
  platform: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
