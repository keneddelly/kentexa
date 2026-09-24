import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Parcel } from './parcel.entity';

// Historical custody evidence. No service writes this table in Stage 3A1.
// IDs below are snapshots, not relations that can erase provenance on deletion.
@Entity('parcel_custody_event')
@Index('UQ_parcel_custody_operation', ['parcelId', 'operationKey'], { unique: true })
@Index('IDX_parcel_custody_parcel_time', ['parcelId', 'recordedAt', 'id'])
export class ParcelCustodyEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  parcelId: number;

  @ManyToOne(() => Parcel, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'parcelId', foreignKeyConstraintName: 'FK_parcel_custody_parcel' })
  parcel: Parcel;

  @Column({ type: 'varchar', length: 64 })
  eventKind: string;

  @Column({ type: 'varchar', length: 128 })
  operationKey: string;

  @Column({ type: 'varchar', length: 24, nullable: true })
  fromCustodianType: string | null;

  @Column({ type: 'int', nullable: true })
  fromCustodianId: number | null;

  @Column({ type: 'varchar', length: 24, nullable: true })
  toCustodianType: string | null;

  @Column({ type: 'int', nullable: true })
  toCustodianId: number | null;

  @Column({ type: 'varchar', length: 24 })
  actorSource: string;

  @Column({ type: 'int', nullable: true })
  actorUserId: number | null;

  @Column({ type: 'int', nullable: true })
  actorAccountRoleId: number | null;

  @Column({ type: 'int', nullable: true })
  actorWorkspaceId: number | null;

  @Column({ type: 'int', nullable: true })
  hubId: number | null;

  @Column({ type: 'int', nullable: true })
  assignmentId: number | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  evidenceRef: string | null;

  @CreateDateColumn({ type: 'timestamp without time zone' })
  recordedAt: Date;
}
