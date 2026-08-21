import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Sale } from './sale.entity';
import { Product } from '../../products/entities/products.entity';

@Entity('sale_item')
export class SaleItem {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Sale, (sale) => sale.items, { onDelete: 'CASCADE' })
  @JoinColumn()
  sale: Sale;

  @Column()
  saleId: number;

  @ManyToOne(() => Product, { eager: true, onDelete: 'SET NULL', nullable: true })
  @JoinColumn()
  product: Product | null;

  @Column({ type: 'int', nullable: true })
  productId: number | null;

  // Snapshotted at sale time — a receipt from last month must keep showing
  // what was actually sold even if the product is later renamed/re-priced/
  // deleted.
  @Column()
  productName: string;

  @Column({ type: 'varchar', nullable: true })
  sku: string | null;

  @Column({ type: 'int' })
  quantity: number;

  @Column('decimal', { precision: 12, scale: 2 })
  unitPrice: number;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  lineDiscount: number;

  @Column('decimal', { precision: 12, scale: 2 })
  lineTotal: number;
}
