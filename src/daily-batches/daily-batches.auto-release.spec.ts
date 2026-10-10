import { DailyBatchesService } from './daily-batches.service';

// Safety fix (b): autoReleaseEscrow sends the "order completed" emails only
// when THIS run really released the money -- never for an order that was
// already released (another run, the buyer, an admin).
function build(alreadyReleased: boolean) {
  const order = { id: 5, sellerAmount: 9000, seller: { name: 'S', email: 's@x.tz', phone: '0700' }, buyer: { name: 'B', email: 'b@x.tz' } };
  const qb: any = {};
  for (const m of ['leftJoinAndSelect', 'where', 'andWhere']) qb[m] = jest.fn(() => qb);
  qb.getMany = jest.fn(async () => [order]);
  const orderRepo = { createQueryBuilder: jest.fn(() => qb) };
  const notifications = { orderCompleted: jest.fn(async () => undefined) };
  const orderRelease = { releaseSellerProceeds: jest.fn(async () => ({ released: true, alreadyReleased, routing: null })) };
  const svc = new DailyBatchesService(
    {} as any, {} as any, {} as any, orderRepo as any, {} as any, {} as any,
    notifications as any, {} as any, {} as any, orderRelease as any,
  );
  return { svc, notifications, orderRelease };
}

describe('autoReleaseEscrow', () => {
  beforeEach(() => { jest.spyOn(console, 'log').mockImplementation(() => {}); });
  afterEach(() => jest.restoreAllMocks());

  it('sends the completion emails when this run released the money', async () => {
    const { svc, notifications, orderRelease } = build(false);
    await svc.autoReleaseEscrow();
    expect(orderRelease.releaseSellerProceeds).toHaveBeenCalledWith(expect.objectContaining({ orderId: 5, source: 'AUTO_RELEASE' }));
    expect(notifications.orderCompleted).toHaveBeenCalledTimes(1);
  });

  it('sends nothing when the order had already been released', async () => {
    const { svc, notifications } = build(true);
    await svc.autoReleaseEscrow();
    expect(notifications.orderCompleted).not.toHaveBeenCalled();
  });
});
