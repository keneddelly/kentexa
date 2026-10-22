import { NotFoundException } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { InventoryService } from '../inventory/inventory.service';
import { Product } from './entities/products.entity';
import { InventoryMovementReason } from '../inventory/entities/inventory-movement.entity';

/**
 * Sold out (stock 0): hidden from buyers, still visible to the seller, and the
 * seller gets ONE restock notice when stock reaches zero.
 */
describe('GET /products/:id — sold out', () => {
  const product = (stock: number) => ({
    id: 5, name: 'Simu A', stock, seller: { id: 2 },
    variants: [{ id: 6, stock: 0 }, { id: 7, stock: 3 }],
    otherOffers: [{ productId: 8, stock: 0 }, { productId: 9, stock: 1 }],
  });
  const controller = (p: any, staffOf: number[] = []) =>
    Object.assign(Object.create(ProductsController.prototype), {
      service: { findOne: jest.fn().mockResolvedValue(p) },
      sellerScope: { isAuthorizedFor: jest.fn(async (u: any, sellerId: number) => u.id === sellerId || staffOf.includes(sellerId)) },
    }) as ProductsController;

  it('a buyer (or nobody logged in) cannot open a sold-out product', async () => {
    await expect(controller(product(0)).findOne(5, { user: null })).rejects.toBeInstanceOf(NotFoundException);
    await expect(controller(product(0)).findOne(5, { user: { id: 7, role: 'user' } })).rejects.toThrow('Bidhaa hii imeisha.');
  });

  it('the seller, their staff and an admin still open it', async () => {
    expect((await controller(product(0)).findOne(5, { user: { id: 2, role: 'seller' } })).stock).toBe(0);
    expect((await controller(product(0), [2]).findOne(5, { user: { id: 9, role: 'user' } })).stock).toBe(0);
    expect((await controller(product(0)).findOne(5, { user: { id: 1, role: 'admin' } })).stock).toBe(0);
  });

  it('in stock: buyers see it, without sold-out variants or offers', async () => {
    const res: any = await controller(product(4)).findOne(5, { user: null });
    expect(res.variants.map((v) => v.id)).toEqual([7]);
    expect(res.otherOffers.map((o) => o.productId)).toEqual([9]);
  });
});

describe('InventoryService — one restock notice at zero', () => {
  function setup(stock: number) {
    const row = { id: 5, name: 'Simu A', stock, isAvailable: true };
    const productRepo = {
      createQueryBuilder: () => ({ setLock() { return this; }, where() { return this; }, getOne: async () => row }),
      save: jest.fn(async (p) => p),
      findOne: jest.fn(async () => ({ ...row, seller: { id: 2 } })),
    };
    const movementRepo = { save: jest.fn(async (m) => m), create: jest.fn((m) => m) };
    const manager = { getRepository: (e: any) => (e === Product ? productRepo : movementRepo) };
    const dataSource = { transaction: (fn: any) => fn(manager), getRepository: () => productRepo };
    const inAppNotif = { notify: jest.fn().mockResolvedValue(undefined) };
    const svc = new InventoryService(dataSource as any, inAppNotif as any);
    return { svc, row, inAppNotif };
  }
  const sell = (svc: InventoryService, n: number) => svc.adjustStock(5, -n, InventoryMovementReason.KENTEXA_ONLINE);

  it('the sale that empties the stock sends one notice naming the product; no repeats while at zero', async () => {
    const { svc, row, inAppNotif } = setup(2);
    await sell(svc, 1);
    expect(inAppNotif.notify).not.toHaveBeenCalled();
    await sell(svc, 1);
    expect(row).toEqual(expect.objectContaining({ stock: 0, isAvailable: false }));
    expect(inAppNotif.notify).toHaveBeenCalledTimes(1);
    expect(inAppNotif.notify).toHaveBeenCalledWith(expect.objectContaining({
      userId: 2, type: 'restock', title: 'Bidhaa imeisha', body: expect.stringContaining('"Simu A" imeisha'),
    }));
    await expect(sell(svc, 1)).rejects.toThrow();
    expect(inAppNotif.notify).toHaveBeenCalledTimes(1);
    // Restocked, then sold out again: that is a new notice.
    await svc.adjustStock(5, 3, InventoryMovementReason.MANUAL);
    await sell(svc, 3);
    expect(inAppNotif.notify).toHaveBeenCalledTimes(2);
  });
});
