import { ConflictException } from '@nestjs/common';
import { OrdersService } from './orders.service';

const key = '00539a79-7cc1-4332-bf88-ac5f98271222';
const buyer = { id: 42 } as any;
const dto = { checkoutRequestKey: key, productId: 7, quantity: 1, paymentMethod: 'online' } as any;

function harness(existing: any = null) {
  const manager = {
    query: jest.fn().mockResolvedValue(undefined),
    getRepository: jest.fn((entity: any) => entity.name === 'Order'
      ? { findOne: jest.fn().mockResolvedValue(existing) }
      : { findOne: jest.fn().mockResolvedValue({ invoiceNumber: 'KNT-INV-1' }) }),
  };
  const service: any = Object.create(OrdersService.prototype);
  service.dataSource = { transaction: jest.fn(async (run: any) => run(manager)) };
  service.createNew = jest.fn().mockResolvedValue({ saved: { id: 9 } });
  service.finishCreate = jest.fn().mockResolvedValue({ id: 9, invoiceNumber: 'KNT-INV-1' });
  return { manager, service };
}

test('creation holds a buyer/request lock and finishes after the core transaction', async () => {
  const { manager, service } = harness();
  await expect(service.create(dto, buyer)).resolves.toMatchObject({ id: 9 });
  expect(manager.query).toHaveBeenCalledWith(expect.stringContaining('pg_advisory_xact_lock'), [42, key]);
  expect(service.createNew).toHaveBeenCalledWith(dto, buyer, manager, expect.stringMatching(/^[0-9a-f]{64}$/));
  expect(service.finishCreate).toHaveBeenCalledTimes(1);
});

test('a retry returns the committed order/invoice without creating or notifying again', async () => {
  const first = harness();
  await first.service.create(dto, buyer);
  const hash = first.service.createNew.mock.calls[0][3];
  const { service } = harness({ id: 9, buyer, checkoutRequestPayloadHash: hash });
  await expect(service.create(dto, buyer)).resolves.toMatchObject({ id: 9, invoiceNumber: 'KNT-INV-1' });
  expect(service.createNew).not.toHaveBeenCalled();
  expect(service.finishCreate).not.toHaveBeenCalled();
});

test('a reused key with a changed payload or buyer is rejected', async () => {
  const { service } = harness({ id: 9, buyer, checkoutRequestPayloadHash: 'different' });
  await expect(service.create(dto, buyer)).rejects.toThrow(ConflictException);
  expect(service.createNew).not.toHaveBeenCalled();
});

test('a core failure never runs postcommit effects', async () => {
  const { service } = harness();
  service.createNew.mockRejectedValue(new Error('stock or invoice failed'));
  await expect(service.create(dto, buyer)).rejects.toThrow('stock or invoice failed');
  expect(service.finishCreate).not.toHaveBeenCalled();
});

test('Order, stock and Invoice use one manager; Invoice failure prevents payout and postcommit effects', async () => {
  const orderRepo = {
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((v: any) => v),
    save: jest.fn(async (v: any) => ({ ...v, id: 9 })),
    update: jest.fn().mockResolvedValue(undefined),
  };
  const payoutRepo = { create: jest.fn(), save: jest.fn() };
  const manager = {
    query: jest.fn().mockResolvedValue(undefined),
    getRepository: jest.fn((entity: any) => entity.name === 'Order' ? orderRepo : payoutRepo),
  };
  const service: any = Object.create(OrdersService.prototype);
  service.repo = orderRepo;
  service.dataSource = { transaction: async (run: any) => run(manager) };
  service.productsService = {
    findOne: jest.fn().mockResolvedValue({
      id: 7, name: 'Camera', isAvailable: true, stock: 3, basePrice: 10000,
      shippingMethod: 'direct', category: 'security', seller: { id: 12 },
    }),
    decreaseStock: jest.fn().mockResolvedValue(undefined),
  };
  service.invoicesService = { createForOrder: jest.fn().mockRejectedValue(new Error('invoice write failed')) };
  service.brandRepo = { findOne: jest.fn() };
  service.finishCreate = jest.fn();

  await expect(service.create(dto, buyer)).rejects.toThrow('invoice write failed');
  expect(orderRepo.save).toHaveBeenCalledTimes(1);
  expect(service.productsService.decreaseStock).toHaveBeenCalledWith(7, 1, expect.anything(),
    expect.objectContaining({ manager, referenceType: 'order', referenceId: 9 }));
  expect(service.invoicesService.createForOrder).toHaveBeenCalledWith(expect.objectContaining({ id: 9 }), manager);
  expect(payoutRepo.save).not.toHaveBeenCalled();
  expect(service.finishCreate).not.toHaveBeenCalled();
});
