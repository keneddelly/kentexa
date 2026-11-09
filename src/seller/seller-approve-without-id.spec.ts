import { SellerApprovalBridgeService } from './seller-approval-bridge.service';
import { SellerStatus } from './entities/seller-profile.entity';

/** Owner 2026-11-09: "still the admin is asked to approve ID first" (the admin Sellers page). */
describe('SellerApprovalBridgeService.approveWithoutId', () => {
  const admin: any = { id: 1 };
  const build = (profile: any) => {
    const verification = { adminMarkChecked: jest.fn(async () => ({ status: 'verified' })) };
    const bridge: any = new SellerApprovalBridgeService(
      { findOne: jest.fn(async () => profile) } as any, {} as any, {} as any, {} as any, verification as any);
    bridge.approve = jest.fn(async () => ({ approved: true }));
    bridge.restore = jest.fn(async () => ({ restored: true }));
    return { bridge, verification };
  };
  const old = { id: 8, businessId: 4, user: { id: 40 }, status: SellerStatus.PENDING, createdAt: new Date('2026-10-01T09:00:00Z') };

  it('a waiting seller from before the gate: ID marked checked with the reason, then approved', async () => {
    const { bridge, verification } = build(old);
    await expect(bridge.approveWithoutId(8, admin, 'Alijisajili kabla ya sharti', 'registered')).resolves.toEqual({ approved: true });
    expect(verification.adminMarkChecked).toHaveBeenCalledWith(40, admin, 'Alijisajili kabla ya sharti', expect.objectContaining({ sellerProfileId: 8 }));
    expect(bridge.approve).toHaveBeenCalledWith(8, admin, 'registered');
  });

  it('a suspended one is restored the normal way', async () => {
    const { bridge } = build({ ...old, status: SellerStatus.SUSPENDED });
    await expect(bridge.approveWithoutId(8, admin, 'sababu ya kweli')).resolves.toEqual({ restored: true });
    expect(bridge.restore).toHaveBeenCalledWith(8, admin, 'sababu ya kweli');
  });

  it('refused after the gate, for an approved seller, or without a reason; nothing is marked', async () => {
    for (const [profile, reason] of [
      [{ ...old, createdAt: new Date('2026-11-08T09:00:00Z') }, 'sababu'],
      [{ ...old, status: SellerStatus.APPROVED }, 'sababu'],
      [old, ' '],
    ] as const) {
      const { bridge, verification } = build(profile);
      await expect(bridge.approveWithoutId(8, admin, reason)).rejects.toBeDefined();
      expect(verification.adminMarkChecked).not.toHaveBeenCalled();
      expect(bridge.approve).not.toHaveBeenCalled();
    }
  });
});
