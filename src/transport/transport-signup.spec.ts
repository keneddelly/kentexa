import { TransportService } from './transport.service';
import { TRANSPORT_SIGNUP_MESSAGES, assertTransportIdSent } from './transport-signup';
import { ProviderStatus } from './entities/transport-provider.entity';

// Msafirishaji (owner 2026-10-14): ID sent to apply; ID verified to approve
// or bring back; already approved providers are not re-checked.
const reader = (status: string | null) => ({ getIdentityProfile: jest.fn(async () => (status ? { status } : null)) });

describe('applying as a transport provider', () => {
  it('no ID or a rejected ID: refused; waiting or verified: may apply (before: verified only)', async () => {
    await expect(assertTransportIdSent(reader(null), 5)).rejects.toThrow(TRANSPORT_SIGNUP_MESSAGES.identityFirst);
    await expect(assertTransportIdSent(reader('not_submitted'), 5)).rejects.toThrow(TRANSPORT_SIGNUP_MESSAGES.identityFirst);
    await expect(assertTransportIdSent(reader('rejected'), 5)).rejects.toThrow(TRANSPORT_SIGNUP_MESSAGES.identityRejected);
    await expect(assertTransportIdSent(reader('pending'), 5)).resolves.toBeUndefined();
    await expect(assertTransportIdSent(reader('verified'), 5)).resolves.toBeUndefined();
  });
});

describe('admin approval of a transport provider', () => {
  const service = (status: ProviderStatus, idStatus: string | null) => {
    const s: any = Object.create(TransportService.prototype);
    s.providerRepo = {
      findOne: jest.fn(async () => ({ id: 3, userId: 5, status })),
      save: jest.fn(async (x: any) => x),
    };
    s.verification = reader(idStatus);
    // stop right after the ID rule: the rest of adminVerify is not part of it
    s.syncServiceAd = jest.fn(async () => { throw new Error('past the ID rule'); });
    return s;
  };

  it('a waiting (pending) provider: approved only with the owner ID verified; nothing written otherwise', async () => {
    const waiting = service(ProviderStatus.PENDING, 'pending');
    await expect(waiting.adminVerify(3, true)).rejects.toThrow(TRANSPORT_SIGNUP_MESSAGES.approveNeedsVerified);
    expect(waiting.providerRepo.save).not.toHaveBeenCalled();
    await expect(service(ProviderStatus.PENDING, 'verified').adminVerify(3, true)).rejects.toThrow('past the ID rule');
  });

  it('bringing back a suspended provider needs a verified owner too', async () => {
    await expect(service(ProviderStatus.SUSPENDED, null).adminVerify(3, true)).rejects.toThrow(TRANSPORT_SIGNUP_MESSAGES.approveNeedsVerified);
  });

  it('an already approved provider is not re-checked; rejecting never needs the ID', async () => {
    const approved = service(ProviderStatus.VERIFIED, null);
    await expect(approved.adminVerify(3, true)).rejects.toThrow('past the ID rule');
    expect(approved.verification.getIdentityProfile).not.toHaveBeenCalled();
    await expect(service(ProviderStatus.PENDING, null).adminVerify(3, false)).rejects.toThrow('past the ID rule');
  });
});
