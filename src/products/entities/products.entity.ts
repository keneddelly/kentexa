import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum ShippingMethod {
  DIRECT = 'direct',
  AGENT = 'agent',
}

@Entity()
export class Product {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, { eager: true, nullable: true, onDelete: 'SET NULL' })
  @JoinColumn()
  seller: User | null;

  // Which specific CommerceProfile this was posted AS — plain nullable id
  // (not a relation), same pattern as Classified.commerceProfileId. Null
  // on products posted before this column existed, which keep resolving
  // to the seller's business identity as before.
  @Column({ type: 'int', nullable: true })
  commerceProfileId: number | null;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  // ── Pricing ──
  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  basePrice: number;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  deliveryFee: number;

  // Boda boda fee for intra-city (Dar es Salaam) deliveries
  // Set by seller — used when buyer and seller are in same city
  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  bodaFee: number;

  // City where seller is located — used for same-city detection
  @Column({ type: 'text', nullable: true, default: 'Dar es Salaam' })
  sellerCity: string | null;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  displayPrice: number;

  @Column({ type: 'int', default: 0 })
  stock: number; // the one shared inventory count — every sales channel

  // ── Unified inventory (BIS Local Shop POS) ──
  // sku/barcode: seller-defined, optional — no uniqueness constraint across
  // sellers since two different sellers may reuse the same manufacturer
  // barcode for the same physical product.
  @Column({ type: 'varchar', nullable: true })
  sku: string | null;

  @Column({ type: 'varchar', nullable: true })
  barcode: string | null;

  // What BIS paid for this unit — never shown to buyers, only used for the
  // seller's own gross-profit reporting. Separate from basePrice/
  // displayPrice, which are what the CUSTOMER pays.
  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  costPrice: number | null;

  // Below this, the product surfaces on the seller's low-stock dashboard.
  @Column({ type: 'int', default: 0 })
  minStockThreshold: number;

  // Which channels this product is allowed to sell through — a POS-only
  // product (e.g. something BIS doesn't want to ship) or an online-only
  // one both need to exist without showing up where they shouldn't.
  @Column({ default: true })
  availableOnline: boolean;

  @Column({ default: true })
  availableInStore: boolean;

  // Seller's explicit choice — Cash on Delivery is never assumed available.
  // Default false: a product only becomes COD-eligible when the seller
  // deliberately turns it on. Gates OrdersService.create()'s COD branch;
  // see orders.service.ts's own comment there.
  @Column({ default: false })
  codEnabled: boolean;

  // ── Category & Subcategory ──
  @Column({ type: 'text', nullable: true })
  category: string | null;

  @Column({ type: 'text', nullable: true })
  subcategory: string | null;

  // Model number/name e.g. "Samsung A15 128GB" — lets wholesale buyers reference
  // an exact product over WhatsApp when a seller lists many similar items.
  @Column({ type: 'text', nullable: true })
  model: string | null;

  // Plain nullable id, not a relation — same zero-import-coupling
  // convention as commerceProfileId on this same entity. Optional: the
  // vast majority of existing/future products have no structured brand at
  // all, and this must never require one. When set, product-read
  // serialization (ProductsService) attaches a computed
  // brandAuthorizationBadge via BrandAuthorizationsService — never stored
  // here, never trusted from the client. See src/brands/brands.module.ts.
  @Column({ type: 'int', nullable: true })
  brandId: number | null;

  // Optional per-product override of this product's warranty length in
  // months (spec §15) — falls back to Brand.defaultWarrantyMonths when
  // unset. Never required; a product with neither simply can't register
  // a warranty (see WarrantyService.register()).
  @Column({ type: 'int', nullable: true })
  warrantyMonths: number | null;

  // ── Variants (Phase B) ──────────────────────────────────────────────────
  // Deliberately NOT a restructure of Product itself — a "variant" is just
  // another independent Product row (own price/stock/images, same
  // inventory-movement ledger as any other product) that happens to share
  // a variantGroupId with its siblings. Keeps every existing consumer of
  // Product (Order, Sale/POS, Inventory, Search, ...) completely
  // unaffected. See src/products/entities/product-variant-group.entity.ts.
  @Column({ type: 'int', nullable: true })
  variantGroupId: number | null;

  // e.g. { color: "White", size: "M" } — keys must be attributes flagged
  // isVariantAttribute: true for this product's category (categories.data.ts
  // getVariantAttributeDefs()/validateVariantAttributes()), never a
  // separate ad-hoc naming scheme.
  @Column({ type: 'jsonb', nullable: true })
  variantAttributes: Record<string, string> | null;

  // Optional link to the brand's own canonical catalog entry — when set,
  // other sellers' Product rows sharing the same officialProductId are
  // surfaced as otherOffers on this product's read (ProductsService.
  // findOne()). See src/products/entities/official-product.entity.ts.
  @Column({ type: 'int', nullable: true })
  officialProductId: number | null;

  // ── Product Specs (JSON: { "Resolution": "1080P", "Battery": "2hrs" }) ──
  @Column({ type: 'json', nullable: true })
  specs: Record<string, string> | null;

  // ── Product Features (JSON array: ["WiFi Live View", "Night Vision"]) ──
  @Column({ type: 'json', nullable: true })
  features: string[] | null;

  @Column({ type: 'simple-array', nullable: true })
  images: string[];

  @Column({ default: true })
  isAvailable: boolean;

  @Column({ default: true })
  isActive: boolean;

  // ── Shipping ──
  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  weightKg: number | null;

  @Column({
    type: 'enum',
    enum: ShippingMethod,
    default: ShippingMethod.AGENT,
  })
  shippingMethod: ShippingMethod;

  @Column({ type: 'text', nullable: true })
  estimatedDelivery: string | null;

  @Column({ type: 'text', nullable: true })
  shippingNotes: string | null;

  // ── Store badges ──
  // isFeatured/isRecommended are curatorial — admin-set via PATCH
  // /products/:id/badges (see products.controller.ts). isBestSeller and
  // isNewArrival aren't stored at all — they're derived at read time in
  // profile.service.ts from salesCount/createdAt, which are always
  // up to date and need no admin upkeep.
  // ── Digital products (Layer 1 seller verification) ─────────────────────
  // 'physical' by default -- zero behavior/data change for every product
  // that exists today. A 'digital' product has no shipping/stock scarcity
  // (see ProductsService.create()) and its file lives in a linked
  // DigitalProductAsset row, never on this entity directly.
  @Column({ type: 'varchar', default: 'physical' })
  productType: 'physical' | 'digital';

  @Column({ default: false })
  isFeatured: boolean;

  @Column({ default: false })
  isRecommended: boolean;

  @Column({ type: 'int', default: 0 })
  salesCount: number;

  // ── Social proof tracking (resets daily) ──
  @Column({ type: 'int', default: 0 })
  viewsToday: number;

  @Column({ type: 'date', nullable: true })
  viewsResetDate: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
