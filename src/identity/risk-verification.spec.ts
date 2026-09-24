import { VerificationService } from './verification.service';
import { Feature } from './verification.constants';
import { IdentityVerificationStatus } from './entities/identity-profile.entity';

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
    for (const feature of [Feature.POST_CLASSIFIED, Feature.CREATE_STORE, Feature.CREATE_PRODUCT, Feature.CREATE_SERVICE]) {
      await expect(service.requireFeature(5, feature)).resolves.toBeUndefined();
    }
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
});
