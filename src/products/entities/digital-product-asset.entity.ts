import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Product } from './products.entity';

// The actual downloadable file for a productType==='digital' Product.
// cloudinaryPublicId is a private/authenticated Cloudinary asset -- never
// a public URL -- so a signed, short-lived download link must always be
// generated on demand (ProductsService.getDownloadUrl()), never stored or
// served directly. Kept as its own table rather than columns on Product
// itself: Product is already ~30 physical-goods-shaped columns, and every
// field here is meaningless for the overwhelming majority of products.
@Entity('digital_product_assets')
export class DigitalProductAsset {
  @PrimaryGeneratedColumn()
  id: number;

  @OneToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn()
  product: Product;

  @Column({ type: 'varchar' })
  cloudinaryPublicId: string;

  @Column({ type: 'varchar' })
  format: string;

  @Column({ type: 'bigint' })
  fileSizeBytes: number;

  @Column({ type: 'text', nullable: true })
  licenseType: string | null;

  // Required before a digital product can be created (see
  // ProductsService.create()) -- the seller's self-declaration that they
  // have the right to sell this file. The audit's replacement for
  // demanding BRELA registration just to sell an eBook.
  @Column({ type: 'timestamp' })
  copyrightDeclaredAt: Date;

  // Null = unlimited. Not yet enforced anywhere (see plan's "explicitly
  // not in this phase") -- the column exists so a future phase can add
  // real enforcement without a migration.
  @Column({ type: 'int', nullable: true })
  maxDownloads: number | null;

  @CreateDateColumn()
  createdAt: Date;
}
