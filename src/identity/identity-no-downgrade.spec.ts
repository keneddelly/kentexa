import { VerificationService } from './verification.service';
import { IdentityVerificationStatus } from './entities/identity-profile.entity';

// Sending the ID again must never take a VERIFIED person back to "waiting".
function service(existing: any) {
  const s: any = Object.create(VerificationService.prototype);
  s.identityRepo = {
    findOne: jest.fn(async () => existing),
    create: jest.fn((x: any) => ({ ...x })),
    save: jest.fn(async (x: any) => x),
  };
  s.auditRepo = { create: jest.fn((x: any) => x), save: jest.fn(async () => undefined) };
  s.provider = { submit: jest.fn(async () => ({ status: IdentityVerificationStatus.PENDING })) };
  return s;
}
const data: any = { idType: 'nida', idNumber: '19900101-11111-00001-23', legalName: 'Juma Ally', dateOfBirth: '1990-01-01', idDocumentImageUrl: 'https://x/id.jpg' };

describe('sending the ID again', () => {
  it('a VERIFIED identity stays verified: nothing overwritten, no history row', async () => {
    const verified = { id: 1, status: IdentityVerificationStatus.VERIFIED, idNumber: 'OLD' };
    const s = service(verified);
    await expect(s.submit({ id: 50 }, data)).resolves.toBe(verified);
    expect(verified).toMatchObject({ status: 'verified', idNumber: 'OLD' });
    expect(s.identityRepo.save).not.toHaveBeenCalled();
    expect(s.auditRepo.save).not.toHaveBeenCalled();
    expect(s.provider.submit).not.toHaveBeenCalled();
  });

  it('a WAITING or REJECTED identity can still be sent again (goes to waiting)', async () => {
    for (const status of [IdentityVerificationStatus.PENDING, IdentityVerificationStatus.REJECTED]) {
      const s = service({ id: 1, status });
      const r = await s.submit({ id: 50 }, data);
      expect(r.status).toBe('pending');
      expect(s.identityRepo.save).toHaveBeenCalled();
    }
  });

  it('no identity yet: created as waiting', async () => {
    const s = service(null);
    expect((await s.submit({ id: 50 }, data)).status).toBe('pending');
  });
});
