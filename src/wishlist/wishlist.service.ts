/**
 * WishlistService
 * Place at: src/wishlist/wishlist.service.ts
 */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Wishlist } from './entities/wishlist.entity';

@Injectable()
export class WishlistService {
  constructor(
    @InjectRepository(Wishlist)
    private repo: Repository<Wishlist>,
  ) {}

  async getMyWishlist(userId: number): Promise<Wishlist[]> {
    return this.repo.find({
      where: { userId },
      relations: { classified: true },
      order: { savedAt: 'DESC' },
    });
  }

  async toggle(
    userId: number,
    classifiedId: number,
    note?: string,
  ): Promise<{ saved: boolean }> {
    const existing = await this.repo.findOne({
      where: { userId, classifiedId },
    });
    if (existing) {
      await this.repo.delete(existing.id);
      return { saved: false };
    }
    await this.repo.save(
      this.repo.create({ userId, classifiedId, note: note || null }),
    );
    return { saved: true };
  }

  async isSaved(userId: number, classifiedId: number): Promise<boolean> {
    const exists = await this.repo.findOne({ where: { userId, classifiedId } });
    return !!exists;
  }

  async removeFromWishlist(userId: number, wishlistId: number): Promise<void> {
    await this.repo.delete({ id: wishlistId, userId });
  }

  async getWishlistIds(userId: number): Promise<number[]> {
    const items = await this.repo.find({
      where: { userId },
      select: { classifiedId: true },
    });
    return items.map((i) => i.classifiedId).filter(Boolean) as number[];
  }
}
