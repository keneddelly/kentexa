import { Check, Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

// Historical custody evidence. IDs below are snapshots, not relations that
// can erase provenance on deletion.
//
// `parcelId` is deliberately a PLAIN column with no `@ManyToOne(Parcel)`
// relation (Stage 3S-C4) -- Parcel's own relation graph (Order, Shipment,
// User, SuperAgent, ...) made this entity impossible to register in a
// synchronize:true test DataSource alongside the Stage 3S-C1/C3 transport
// entities without also resolving that whole graph, the exact problem
// ParcelRunAssignment.parcelId already sidesteps the same way (mirrors
// Shipment.orderId's own established convention for a cross-module
// reference). The real FK (`FK_parcel_custody_parcel`) still lives in the
// migration; nothing here changes the actual database shape, and no
// existing code reads a loaded `.parcel` relation off this entity.
@Entity('parcel_custody_event')
@Index('UQ_parcel_custody_operation', ['parcelId', 'operationKey'], { unique: true })
@Index('IDX_parcel_custody_parcel_time', ['parcelId', 'recordedAt', 'id'])
// Stage 3S-C4: disambiguates `assignmentId`, which meant ONLY legacy
// TransportAssignment.id before this gate. Both new CHECKs are declared
// here as plain (fully-validated) constraints -- correct and sufficient for
// a freshly-built synchronize:true test schema, which has no legacy rows to
// grandfather. The REAL migration additionally applies the pairing CHECK as
// NOT VALID specifically to avoid retroactively rejecting the real,
// already-populated production table's existing rows (see
// 1788286800000-AddParcelCustodyAssignmentDiscriminator.ts) -- a property
// TypeORM's @Check decorator has no way to express, the same class of gap
// Stage 3S-C1's DEFERRABLE constraint and Stage 3S-B4's GiST exclusion hit.
@Check('CHK_parcel_custody_assignment_type_vocab',
  `"assignmentType" IS NULL OR "assignmentType" IN ('transport_assignment','parcel_run_assignment')`)
@Check('CHK_parcel_custody_assignment_type_pairing',
  `("assignmentId" IS NULL) = ("assignmentType" IS NULL)`)
export class ParcelCustodyEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  parcelId: number;

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

  @Column({ type: 'varchar', length: 32, nullable: true })
  actorRoleType: string | null;

  @Column({ type: 'int', nullable: true })
  actorWorkspaceId: number | null;

  @Column({ type: 'int', nullable: true })
  actorProviderId: number | null;

  @Column({ type: 'int', nullable: true })
  hubId: number | null;

  @Column({ type: 'int', nullable: true })
  assignmentId: number | null;

  // Stage 3S-C4: disambiguates what `assignmentId` refers to. NULL on every
  // row recorded before this gate (never backfilled -- this table's own
  // BEFORE UPDATE/DELETE trigger makes it immutable, and a legacy row's
  // `assignmentId` has only ever meant TransportAssignment.id in practice,
  // which is exactly what NULL-here is documented to mean going forward).
  @Column({ type: 'varchar', length: 24, nullable: true })
  assignmentType: 'transport_assignment' | 'parcel_run_assignment' | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  evidenceRef: string | null;

  @CreateDateColumn({ type: 'timestamp without time zone' })
  recordedAt: Date;
}
