import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { Product } from '../products/entities/products.entity';
import {
  InventoryMovement,
  InventoryMovementReason,
} from './entities/inventory-movement.entity';

/**
 * InventoryService — the single place every sales channel touches a
 * Product's stock. Local POS, Kentexa online orders, and manual sales all
 * call adjustStock() so there is exactly one number (Product.stock) and one
 * audit trail (InventoryMovement), never competing per-channel counters.
 */
@Injectable()
export class InventoryService {
  constructor(private dataSource: DataSource) {}

  /**
   * Applies `delta` to a product's stock and writes one audit row for it,
   * inside a single DB transaction with a row lock so two simultaneous
   * sales can't both consume the same last unit.
   *
   * @param delta   positive to add stock, negative to remove it
   * @param reason  why the stock changed — see InventoryMovementReason
   */
  async adjustStock(
    productId: number,
    delta: number,
    reason: InventoryMovementReason,
    opts: {
      referenceType?: 'order' | 'sale' | null;
      referenceId?: number | null;
      note?: string | null;
      userId?: number | null;
      // Pass an existing transaction's manager to make this adjustment part
      // of it — used by SalesService so a multi-item sale (several
      // adjustStock calls) commits or rolls back as one atomic unit instead
      // of each line item being its own independent transaction.
      manager?: EntityManager;
    } = {},
  ): Promise<Product> {
    if (!delta) return this.dataSource.getRepository(Product).findOneOrFail({ where: { id: productId } });

    const run = async (manager: EntityManager) => {
      const productRepo = manager.getRepository(Product);
      const product = await productRepo
        .createQueryBuilder('p')
        .setLock('pessimistic_write')
        .where('p.id = :id', { id: productId })
        .getOne();
      if (!product) throw new NotFoundException('Product not found');

      const newStock = product.stock + delta;
      if (newStock < 0) {
        throw new BadRequestException(
          `Insufficient stock for "${product.name}" — have ${product.stock}, need ${-delta}`,
        );
      }

      product.stock = newStock;
      // Matches ProductsService.decreaseStock()'s existing behavior exactly —
      // only ever flips isAvailable off at zero, never back on automatically
      // (that's a separate, pre-existing gap, not something this change
      // should silently start fixing).
      if (product.stock <= 0) product.isAvailable = false;
      await productRepo.save(product);

      await manager.getRepository(InventoryMovement).save(
        manager.getRepository(InventoryMovement).create({
          productId,
          delta,
          reason,
          referenceType: opts.referenceType ?? null,
          referenceId: opts.referenceId ?? null,
          balanceAfter: product.stock,
          note: opts.note ?? null,
          createdByUserId: opts.userId ?? null,
        }),
      );

      return product;
    };

    return opts.manager ? run(opts.manager) : this.dataSource.transaction(run);
  }

  async getMovements(productId: number, limit = 50): Promise<InventoryMovement[]> {
    return this.dataSource.getRepository(InventoryMovement).find({
      where: { productId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }
}
