import { BusinessCapabilityApplicationService } from './business-capability-application.service';
import { BusinessCapabilityCode } from './entities/business-capability.entity';
import { BusinessCapabilityApplicationStatus } from './entities/business-capability-application.entity';

/**
 * Owner 2026-11-09: sellers who asked to sell through their Business before the ID gate never sent
 * an ID and could not be approved. The admin marks the ID as checked (with a reason), then the
 * normal approval runs. Only those: Selling, still pending, sent before the gate.
 */
describe('approveLegacyWithoutId', () => {
  const admin: any = { id: 1 };
  const build = (app: any, identity: any = null) => {
    const verification = {
      getIdentityProfile: jest.fn(async () => identity),
      adminMarkChecked: jest.fn(async () => ({ id: 77, status: 'verified' })),
    };
    const svc: any = new BusinessCapabilityApplicationService(
      { findOne: jest.fn(async () => app) } as any, {} as any, {} as any, verification as any, {} as any);
    svc.approveApplication = jest.fn(async () => ({ approved: true }));
    return { svc, verification };
  };
  const legacy = { id: 5, businessId: 9, requestedByUserId: 40, capabilityCode: BusinessCapabilityCode.COMMERCE,
    status: BusinessCapabilityApplicationStatus.PENDING, submittedAt: new Date('2026-10-20T10:00:00Z') };

  it('a pending Selling application sent before the gate: ID marked checked (with the reason), then approved', async () => {
    const { svc, verification } = build(legacy);
    await expect(svc.approveLegacyWithoutId(5, admin, 'Ameomba kabla ya sharti')).resolves.toEqual({ approved: true });
    expect(verification.adminMarkChecked).toHaveBeenCalledWith(40, admin, 'Ameomba kabla ya sharti',
      expect.objectContaining({ applicationId: 5, businessId: 9 }));
    expect(svc.approveApplication).toHaveBeenCalledWith(5, admin);
  });

  it('refused after the gate, for other capabilities, when not pending, or when the ID is already checked', async () => {
    for (const app of [
      { ...legacy, submittedAt: new Date('2026-11-08T10:00:00Z') },
      { ...legacy, capabilityCode: BusinessCapabilityCode.TRANSPORT },
      { ...legacy, status: BusinessCapabilityApplicationStatus.APPROVED },
    ]) {
      const { svc, verification } = build(app);
      await expect(svc.approveLegacyWithoutId(5, admin, 'sababu')).rejects.toMatchObject({ response: { code: 'NOT_LEGACY_WITHOUT_ID' } });
      expect(verification.adminMarkChecked).not.toHaveBeenCalled();
    }
    const { svc } = build(legacy, { status: 'verified' });
    await expect(svc.approveLegacyWithoutId(5, admin, 'sababu')).rejects.toMatchObject({ response: { code: 'NOT_LEGACY_WITHOUT_ID' } });
  });
});
