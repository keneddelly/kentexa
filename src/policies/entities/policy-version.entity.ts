import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

// One row per published version of a legal/policy document. `contentRef` is
// a pointer (a frontend route, or a CMS/S3 reference) — the document text
// itself lives wherever it already does (today: the static i18n pages at
// bishoo-frontend/src/public/pages/TermsAndConditions.js etc.), not
// duplicated into the database. This entity's job is purely to answer "what
// version of what policy was active on date X" for consent tracking.
export enum PolicyType {
  TERMS_OF_SERVICE = 'terms_of_service',
  SELLER_TERMS = 'seller_terms',
  PRIVACY_POLICY = 'privacy_policy',
  REFUND_POLICY = 'refund_policy',
  SHIPPING_POLICY = 'shipping_policy',
  PROHIBITED_PRODUCTS_POLICY = 'prohibited_products_policy',
  AI_DATA_POLICY = 'ai_data_policy',
  DISPUTE_POLICY = 'dispute_policy',
}

export enum PolicyVersionStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  ARCHIVED = 'archived',
}

@Entity('policy_version')
@Index(['type', 'status'])
export class PolicyVersion {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'enum', enum: PolicyType })
  type: PolicyType;

  @Column({ type: 'varchar' })
  version: string;

  @Column({ type: 'timestamp' })
  effectiveDate: Date;

  @Column({
    type: 'enum',
    enum: PolicyVersionStatus,
    default: PolicyVersionStatus.DRAFT,
  })
  status: PolicyVersionStatus;

  @Column({ type: 'varchar', nullable: true })
  contentRef: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
