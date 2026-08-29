import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

// One row per phone number that has ever been sent a "join Kentexa" nudge
// riding on a real transaction SMS (GrowthInviteService). Not tied to a
// User — the whole point is that most of these phones AREN'T Kentexa users
// yet. Keyed on the same normalizeTzPhone() canonical format User.phone
// uses, so a lookup by either shape resolves the same row.
@Entity('sms_invite_log')
export class SmsInviteLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', unique: true })
  phone: string;

  @Column({ type: 'timestamp' })
  lastInvitedAt: Date;

  @Column({ type: 'int', default: 1 })
  inviteCount: number;

  // Which InviteContext last triggered a nudge — purely diagnostic, lets
  // an admin/analytics query answer "what's actually driving invites".
  @Column({ type: 'varchar', nullable: true })
  lastEventType: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
