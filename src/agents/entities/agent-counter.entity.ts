import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class AgentCounter {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ default: 0 })
  lastSequence: number;
}
