import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { JourneyActorType } from '../journey-contract';
import type { CargoRequirements } from '../journey-contract';

export enum JourneySelectionStatus {
  SELECTED = 'selected',
  QUOTED = 'quoted',
  COMMITTED = 'committed',
  SUPERSEDED = 'superseded',
  CANCELLED = 'cancelled',
}

@Entity('journey_selection')
@Index('IDX_journey_selection_requester_status', ['requestedByUserId', 'status'])
export class JourneySelection {
  @PrimaryGeneratedColumn() id: number;

  @Column({ type: 'int' }) requestedByUserId: number;
  @Column({ type: 'int', default: 1 }) version: number;
  @Column({ type: 'int', nullable: true }) supersedesSelectionId: number | null;
  @Column({ type: 'int', nullable: true }) supersededBySelectionId: number | null;

  @Column({ type: 'varchar', length: 200 }) originLabel: string;
  @Column({ type: 'int', nullable: true }) originWardId: number | null;
  @Column({ type: 'int', nullable: true }) originRegionId: number | null;
  @Column({ type: 'double precision', nullable: true }) originLatitude: number | null;
  @Column({ type: 'double precision', nullable: true }) originLongitude: number | null;

  @Column({ type: 'varchar', length: 200 }) destinationLabel: string;
  @Column({ type: 'int', nullable: true }) destinationWardId: number | null;
  @Column({ type: 'int', nullable: true }) destinationRegionId: number | null;
  @Column({ type: 'double precision', nullable: true }) destinationLatitude: number | null;
  @Column({ type: 'double precision', nullable: true }) destinationLongitude: number | null;

  @Column({ type: 'jsonb' }) cargoRequirements: CargoRequirements;
  @Column({ type: 'varchar', length: 32, default: JourneySelectionStatus.SELECTED }) status: JourneySelectionStatus;

  // For CASH logistics payment this is derived from the first physical
  // custody leg. It is never a client-selected financial authority.
  @Column({ type: 'varchar', length: 32, nullable: true })
  expectedCashCollectorType: JourneyActorType | null;

  @Column({ type: 'int', nullable: true }) expectedCashCollectionLegSequence: number | null;

  @CreateDateColumn() selectedAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
