/**
 * comment-support.service.ts
 * Place at: src/feed/comment-support.service.ts
 *
 * Two small injectables used by CommentsController's Commerce Comment System
 * additions. Kept separate from CommentsController itself so swapping the
 * order-verification query or the AI provider never touches comment logic.
 */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order, OrderStatus } from '../orders/entities/order.entity';
import { PurchaseVerification } from './entities/post-comment.entity';

// ─────────────────────────────────────────────────────────────────────────
// TODO / INTEGRATION POINT: Order only has a `product` relation (see
// order.entity.ts) — there's no classifiedId/serviceId column. So Kentexa-
// verified purchases can only be auto-detected for entityType === 'product'
// reviews today. Classified/service reviews fall through to
// offlinePurchaseClaim (self-declared) or COMMUNITY until orders gain that
// linkage.
// ─────────────────────────────────────────────────────────────────────────
@Injectable()
export class PurchaseVerificationService {
  constructor(@InjectRepository(Order) private orderRepo: Repository<Order>) {}

  async resolve(
    userId: number,
    entityType: string | null,
    entityId: number | null,
    offlinePurchaseClaim: boolean | undefined,
  ): Promise<PurchaseVerification> {
    if (entityType === 'product' && entityId) {
      const count = await this.orderRepo
        .createQueryBuilder('o')
        .where('o."buyerId" = :userId', { userId })
        .andWhere('o."productId" = :entityId', { entityId })
        .andWhere('o.status IN (:...statuses)', {
          statuses: [OrderStatus.COMPLETED, OrderStatus.DELIVERED],
        })
        .getCount();
      if (count > 0) return PurchaseVerification.KENTEXA_PURCHASE;
    }
    if (offlinePurchaseClaim) return PurchaseVerification.OFFLINE_PURCHASE;
    return PurchaseVerification.COMMUNITY;
  }
}
