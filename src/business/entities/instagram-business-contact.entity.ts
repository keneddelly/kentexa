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
import { InstagramBusinessConnection } from './instagram-business-connection.entity';
import { BusinessCustomer } from './business-customer.entity';

/**
 * Maps an Instagram-scoped sender identity to the BusinessCustomer CRM row
 * for one connected Instagram account. Instagram-scoped IDs are not global
 * customer identities and must never be joined across connections.
 */
@Entity('instagram_business_contact')
@Index('UQ_instagram_contact_connection_sender', ['connectionId', 'instagramScopedUserId'], { unique: true })
@Index('IDX_instagram_contact_customer', ['businessCustomerId'])
export class InstagramBusinessContact {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => InstagramBusinessConnection, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'connectionId' })
  connection: InstagramBusinessConnection;

  @Column({ type: 'int' })
  connectionId: number;

  @ManyToOne(() => BusinessCustomer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'businessCustomerId' })
  businessCustomer: BusinessCustomer;

  @Column({ type: 'int' })
  businessCustomerId: number;

  @Column({ type: 'varchar', length: 128 })
  instagramScopedUserId: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  username: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  displayName: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
