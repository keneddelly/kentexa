import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Unique,
} from 'typeorm';

// Follows a specific CommerceProfile, not a User — deliberately separate
// from the legacy store/follow.entity.ts Follow (which follows a seller
// User and backs the existing Stores/Home business-card UI, untouched
// here). This is what makes "Kened has 100 followers, his business has
// 10k, his hub has 700" a real, independent fact per profile instead of
// one aggregate number on the account.
@Entity('commerce_profile_follow')
@Unique(['followerId', 'commerceProfileId'])
export class CommerceProfileFollow {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  followerId: number;

  @Column()
  commerceProfileId: number;

  @CreateDateColumn()
  createdAt: Date;
}
