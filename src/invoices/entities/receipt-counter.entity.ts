import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class ReceiptCounter {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  year: number;

  @Column({ default: 0 })
  lastSequence: number;
}