import { NotFoundException } from '@nestjs/common';
import { BusinessService } from './business.service';

/**
 * I2D — dashboard capability state is Business-LOCAL. A legacy unbound
 * Seller, or a Seller linked to another Business the same account owns,
 * must never make a Business look Seller-active.
 */
describe('I2D — BusinessService.getDashboard hasSeller is Business-local', () => {
  const bob = { id: 1 } as any;
  const build = (sellerProfiles: Array<{ userId: number; businessId: number | null }>) => {
    const svc: any = Object.create(BusinessService.prototype);
    svc.findById = jest.fn(async (id: number) => ({ id, user: { id: 1 } }));
    svc.sellerProfileRepo = {
      findOne: jest.fn(async ({ where }: any) =>
        sellerProfiles.find((p) => p.userId === where.user.id && p.businessId === where.businessId) ?? null),
    };
    svc.commerceProfiles = { findByBusinessId: jest.fn().mockResolvedValue(null) };
    return svc as BusinessService;
  };

  const WM = 10;
  const EL = 11;

  it('C. a legacy unbound Seller does not mark Washing Machine TZ Seller-active', async () => {
    const svc = build([{ userId: 1, businessId: null }]);
    expect((await svc.getDashboard(WM, bob)).hasSeller).toBe(false);
  });

  it('D. Selling active on Bob Electronics does not mark Washing Machine TZ active (and vice versa)', async () => {
    const svc = build([{ userId: 1, businessId: EL }]);
    expect((await svc.getDashboard(WM, bob)).hasSeller).toBe(false);
    expect((await svc.getDashboard(EL, bob)).hasSeller).toBe(true);
  });

  it('a Seller linked to THIS Business is Seller-active there', async () => {
    const svc = build([{ userId: 1, businessId: WM }, { userId: 1, businessId: null }]);
    expect((await svc.getDashboard(WM, bob)).hasSeller).toBe(true);
  });

  it('G. an inaccessible Business (not owned) cannot be read', async () => {
    const svc = build([]);
    await expect(svc.getDashboard(WM, { id: 99 } as any)).rejects.toBeInstanceOf(NotFoundException);
  });
});
