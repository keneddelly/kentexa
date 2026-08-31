import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Unique } from 'typeorm';

// Phase A of the Kentexa Communication Engine — one row per
// (eventType, channel, recipientRole, language) combination. `channel`
// is 'in_app' only for now: under the hood that still means bell+push
// together, exactly InAppNotificationService.notify()'s existing
// behavior — SMS/email stay on NotificationsService's own working path,
// untouched by this phase. titleTemplate/bodyTemplate use `{variable}`
// placeholders, substituted by CommunicationEngineService.dispatch().
@Entity('communication_template')
@Unique(['eventType', 'channel', 'recipientRole', 'language'])
export class CommunicationTemplate {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar' })
  eventType: string;

  @Column({ type: 'varchar', default: 'in_app' })
  channel: string;

  @Column({ type: 'varchar' })
  recipientRole: string;

  @Column({ type: 'varchar', default: 'sw' })
  language: string;

  @Column({ type: 'varchar' })
  titleTemplate: string;

  @Column({ type: 'text' })
  bodyTemplate: string;

  @CreateDateColumn()
  createdAt: Date;
}
