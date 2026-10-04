import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import type { CargoRequirements } from '../journey/cargo-requirements';

export enum JourneySelectionStatus {
  SELECTED = 'selected',
  QUOTED = 'quoted',
  COMMITTED = 'committed',
  SUPERSEDED = 'superseded',
  CANCELLED = 'cancelled',
}

export enum JourneyCommitmentLevel {
  SERVICE_CONFIRMED = 'service_confirmed',
  RUN_CONFIRMED = 'run_confirmed',
  VEHICLE_CONFIRMED = 'vehicle_confirmed',
}

export enum JourneyLegType {
  FIRST_MILE = 'first_mile',
  HUB_INTAKE = 'hub_intake',
  TRANSPORT = 'transport',
  TRANSFER = 'transfer',
  LAST_MILE = 'last_mile',
  CUSTOMER_PICKUP = 'customer_pickup',
}

@Entity('journey_selection')
@Index('IDX_journey_selection_requester', ['requestedByUserId', 'createdAt'])
export class JourneySelection {
  @PrimaryGeneratedColumn() id: number;
  @Column({ type: 'int' }) requestedByUserId: number;
  @Column({ type: 'int', default: 1 }) version: number;
  @Column({ type: 'int', nullable: true }) supersedesSelectionId: number | null;
  @Column({ type: 'int', nullable: true }) supersededBySelectionId: number | null;
  @Column({ type: 'varchar', length: 24, default: JourneySelectionStatus.SELECTED }) status: JourneySelectionStatus;
  @Column({ type: 'jsonb' }) originSnapshot: Record<string, unknown>;
  @Column({ type: 'jsonb' }) destinationSnapshot: Record<string, unknown>;
  @Column({ type: 'jsonb' }) cargoRequirements: CargoRequirements;
  @Column({ type: 'varchar', length: 32, nullable: true }) expectedCashCollectorType: string | null;
  @Column({ type: 'int', nullable: true }) expectedCashCollectionLegSequence: number | null;
  @Column({ type: 'timestamp', default: () => 'now()' }) selectedAt: Date;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

@Entity('journey_leg')
@Index('UQ_journey_leg_sequence', ['journeySelectionId', 'sequence'], { unique: true })
export class JourneyLeg {
  @PrimaryGeneratedColumn() id: number;
  @Column({ type: 'int' }) journeySelectionId: number;
  @Column({ type: 'int' }) sequence: number;
  @Column({ type: 'varchar', length: 24 }) type: JourneyLegType;
  @Column({ type: 'jsonb' }) fromNode: Record<string, unknown>;
  @Column({ type: 'jsonb' }) toNode: Record<string, unknown>;
  @Column({ type: 'int', nullable: true }) providerId: number | null;
  @Column({ type: 'int', nullable: true }) routeId: number | null;
  @Column({ type: 'int', nullable: true }) loadRouteStopId: number | null;
  @Column({ type: 'int', nullable: true }) unloadRouteStopId: number | null;
  @Column({ type: 'int', nullable: true }) availabilityId: number | null;
  @Column({ type: 'int', nullable: true }) runId: number | null;
  @Column({ type: 'int', nullable: true }) agentId: number | null;
  @Column({ type: 'int', nullable: true }) superAgentId: number | null;
  @Column({ type: 'varchar', length: 24, default: JourneyCommitmentLevel.SERVICE_CONFIRMED }) commitmentLevel: JourneyCommitmentLevel;
  @Column({ type: 'varchar', length: 32, nullable: true }) requiredActorCapability: string | null;
  @Column({ type: 'jsonb', default: () => "'{}'" }) executionRequirements: Record<string, unknown>;
  @CreateDateColumn() createdAt: Date;
}
