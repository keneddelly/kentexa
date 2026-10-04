import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { JourneyActorType, JourneyCommitmentLevel, JourneyLegType } from '../journey-contract';

@Entity('journey_leg')
@Index('UQ_journey_leg_sequence', ['journeySelectionId', 'sequence'], { unique: true })
export class JourneyLeg {
  @PrimaryGeneratedColumn() id: number;
  @Column({ type: 'int' }) journeySelectionId: number;
  @Column({ type: 'int' }) sequence: number;
  @Column({ type: 'varchar', length: 32 }) legType: JourneyLegType;
  @Column({ type: 'varchar', length: 32 }) actorType: JourneyActorType;
  @Column({ type: 'varchar', length: 200 }) fromLabel: string;
  @Column({ type: 'varchar', length: 200 }) toLabel: string;
  @Column({ type: 'int', nullable: true }) providerId: number | null;
  @Column({ type: 'int', nullable: true }) routeId: number | null;
  @Column({ type: 'int', nullable: true }) availabilityId: number | null;
  @Column({ type: 'int', nullable: true }) runId: number | null;
  @Column({ type: 'int', nullable: true }) vehicleId: number | null;
  @Column({ type: 'int', nullable: true }) fromRouteStopId: number | null;
  @Column({ type: 'int', nullable: true }) toRouteStopId: number | null;
  @Column({ type: 'int', nullable: true }) agentId: number | null;
  @Column({ type: 'int', nullable: true }) superAgentId: number | null;
  @Column({ type: 'varchar', length: 32, default: JourneyCommitmentLevel.SERVICE_CONFIRMED })
  commitmentLevel: JourneyCommitmentLevel;
  @Column({ type: 'jsonb', default: () => "'{}'" }) compatibility: Record<string, unknown>;
  @CreateDateColumn() createdAt: Date;
}
