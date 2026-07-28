import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class InvoiceCounter {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  year: number;

  @Column({ default: 0 })
  lastSequence: number;
}
