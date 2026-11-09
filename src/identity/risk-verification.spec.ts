import { VerificationService } from './verification.service';
import { Feature } from './verification.constants';
import { IdentityVerificationStatus } from './entities/identity-profile.entity';
import { WalletService } from '../wallet/wallet.service';

describe('risk-based verification', () => {
  const identity = { findOne: jest.fn() };
  const seller = { findOne: jest.fn() };
  const superAgent = { findOne: jest.fn() };
  const service = new VerificationService(identity as any, {} as any, seller as any,
    superAgent as any, {} as any, {} as any, {} as any, {} as any, {} as any);

  beforeEach(() => {
    jest.clearAllMocks();
    seller.findOne.mockResolvedValue(null);
    superAgent.findOne.mockResolvedValue(null);
  });

  it('permits ordinary posting with no identity record', async () => {
    identity.findOne.mockResolvedValue(null);
    for (const feature of [Feature.POST_CLASSIFIED, Feature.CREATE_PRODUCT, Feature.CREATE_SERVICE]) {
      await expect(service.requireFeature(5, feature)).resolves.toBeUndefined();
    }
  });

  // Owner 2026-11-09: asking to sell needs the ID SENT; waiting for review is enough to apply.
  it('asking to sell: no ID is refused (the ID form opens), a sent ID waiting for review is enough', async () => {
    identity.findOne.mockResolvedValue(null);
    await expect(service.requireFeature(5, Feature.CREATE_STORE)).rejects.toMatchObject({ response: { code: 'VERIFICATION_REQUIRED' } });
    identity.findOne.mockResolvedValue({ status: IdentityVerificationStatus.REJECTED, rejectionReason: 'blurry' });
    await expect(service.requireFeature(5, Feature.CREATE_STORE)).rejects.toMatchObject({ response: { code: 'VERIFICATION_REJECTED' } });
    identity.findOne.mockResolvedValue({ status: IdentityVerificationStatus.PENDING });
    await expect(service.requireFeature(5, Feature.CREATE_STORE)).resolves.toBeUndefined();
    identity.findOne.mockResolvedValue({ status: IdentityVerificationStatus.VERIFIED });
    await expect(service.requireFeature(5, Feature.CREATE_STORE)).resolves.toBeUndefined();
  });

  it('rejects pending identity for payments, transport and custody', async () => {
    identity.findOne.mockResolvedValue({ status: IdentityVerificationStatus.PENDING });
    for (const feature of [Feature.RECEIVE_PAYMENT, Feature.USE_ESCROW, Feature.BECOME_SUPER_AGENT, Feature.BECOME_TRANSPORTER, Feature.CREATE_SHIPMENT]) {
      await expect(service.requireFeature(5, feature)).rejects.toMatchObject({ response: { code: 'VERIFICATION_REQUIRED' } });
    }
  });

  it('accepts approved identity for authority but still requires seller approval for funds', async () => {
    identity.findOne.mockResolvedValue({ status: IdentityVerificationStatus.VERIFIED });
    await expect(service.requireFeature(5, Feature.BECOME_TRANSPORTER)).resolves.toBeUndefined();
    await expect(service.requireFeature(5, Feature.RECEIVE_PAYMENT)).rejects.toMatchObject({ response: { code: 'SELLER_APPLICATION_REQUIRED' } });
  });

  it('blocks a business withdrawal before resolving a payout destination when identity is pending', async () => {
    identity.findOne.mockResolvedValue({ status: IdentityVerificationStatus.PENDING });
    const payout = { assertBusinessOwner: jest.fn(), getUsableDestination: jest.fn() };
    const wallet = new WalletService({} as any, {} as any, {} as any, {} as any,
      service, payout as any, { isEnabled: () => true } as any);
    await expect(wallet.requestBusinessWithdrawal({ identityType: 'BUSINESS', workspaceId: 3, userId: 5 }, 100))
      .rejects.toMatchObject({ response: { code: 'VERIFICATION_REQUIRED' } });
    expect(payout.assertBusinessOwner).not.toHaveBeenCalled();
  });
});

// Owner 2026-11-09: the admin may mark an old seller's ID as checked; always recorded with who and why.
describe('adminMarkChecked', () => {
  const build = (existing: any) => {
    const identity = { findOne: jest.fn(async () => existing), create: jest.fn((x) => ({ ...x })), save: jest.fn(async (x) => ({ id: 3, ...x })) };
    const audit = { create: jest.fn((x) => x), save: jest.fn(async (x) => x) };
    const events = { record: jest.fn(async () => undefined) };
    const svc = new VerificationService(identity as any, audit as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, events as any);
    return { svc, identity, audit, events };
  };

  it('no ID: becomes checked, with the admin, the reason, an audit row and an IDENTITY event', async () => {
    const { svc, identity, audit, events } = build(null);
    const r = await svc.adminMarkChecked(40, { id: 1 } as any, 'Aliomba kabla ya sharti', { applicationId: 5 });
    expect(r).toMatchObject({ status: IdentityVerificationStatus.VERIFIED, reviewedBy: 1 });
    expect(identity.save).toHaveBeenCalled();
    expect(audit.save).toHaveBeenCalledWith(expect.objectContaining({ previousStatus: 'not_submitted', newStatus: 'verified', reviewedBy: 1,
      reason: expect.stringContaining('without a document: Aliomba kabla ya sharti') }));
    expect(events.record).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'IDENTITY_MARKED_CHECKED_BY_ADMIN', actorId: 1, relatedUserId: 40 }));
  });

  it('needs a reason; an already checked ID is left as it is', async () => {
    await expect(build(null).svc.adminMarkChecked(40, { id: 1 } as any, ' ')).rejects.toThrow('sababu');
    const { svc, identity } = build({ id: 3, status: IdentityVerificationStatus.VERIFIED });
    await svc.adminMarkChecked(40, { id: 1 } as any, 'sababu ya kweli');
    expect(identity.save).not.toHaveBeenCalled();
  });
});
