import { BrandAuthorizationsService } from './brand-authorizations.service';
import { BrandAuthorizationStatus } from './entities/business-brand-authorization.entity';

// Safety fix (a): the nightly expiry changes a row ONLY if it is still
// APPROVED, so two runs at the same moment (KNOWN_FAULTS.md #10) can never
// record or notify twice.
function build() {
  const db = new Map<number, string>([[7, BrandAuthorizationStatus.APPROVED]]);
  const overdueRow = () => ({ id: 7, status: BrandAuthorizationStatus.APPROVED, commerceProfileId: 70, brand: { name: 'Acme' } });
  const repo = {
    find: jest.fn(async (opts: any) => (opts.where.expiresAt?._type === 'lessThan' ? [overdueRow()] : [])),
    // save(): the old, unconditional write (kept so the test also runs against the old code).
    save: jest.fn(async (row: any) => { db.set(row.id, row.status); return row; }),
    update: jest.fn(async (where: any, set: any) => {
      if (db.get(where.id) !== where.status) return { affected: 0 };
      db.set(where.id, set.status);
      return { affected: 1 };
    }),
  };
  const auditRepo = { create: jest.fn((x) => x), save: jest.fn(async (x) => x) };
  const profileRepo = { findOne: jest.fn(async () => ({ id: 70, ownerId: 700 })) };
  const userRepo = { findOne: jest.fn(async () => ({ id: 700, phone: '0711000111' })) };
  const notifications = { notify: jest.fn(async () => ({})) };
  const sms = { sendSms: jest.fn(async () => true) };
  const activity = { record: jest.fn() };
  const svc = new BrandAuthorizationsService(
    repo as any, {} as any, auditRepo as any, profileRepo as any, userRepo as any,
    {} as any, notifications as any, sms as any, activity as any,
  );
  return { svc, db, repo, auditRepo, notifications, sms };
}

describe('brand authorization nightly expiry', () => {
  it('expires an overdue approved authorization once: one audit row, one notification, one SMS', async () => {
    const { svc, db, auditRepo, notifications, sms } = build();
    await svc.expireOverdueAuthorizations();
    expect(db.get(7)).toBe(BrandAuthorizationStatus.EXPIRED);
    expect(auditRepo.save).toHaveBeenCalledTimes(1);
    expect(auditRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      previousStatus: BrandAuthorizationStatus.APPROVED, newStatus: BrandAuthorizationStatus.EXPIRED, reason: 'auto-expired',
    }));
    expect(notifications.notify).toHaveBeenCalledTimes(1);
    expect(sms.sendSms).toHaveBeenCalledTimes(1);
  });

  it('three runs at the same moment still record and notify only once', async () => {
    const { svc, auditRepo, notifications, sms, repo } = build();
    await Promise.all([svc.expireOverdueAuthorizations(), svc.expireOverdueAuthorizations(), svc.expireOverdueAuthorizations()]);
    expect(repo.update).toHaveBeenCalledTimes(3);       // every run tries...
    expect(auditRepo.save).toHaveBeenCalledTimes(1);    // ...only one changes the row
    expect(notifications.notify).toHaveBeenCalledTimes(1);
    expect(sms.sendSms).toHaveBeenCalledTimes(1);
  });

  it('does nothing if the authorization was already changed (e.g. revoked by an admin)', async () => {
    const { svc, db, auditRepo, sms } = build();
    db.set(7, BrandAuthorizationStatus.REVOKED);
    await svc.expireOverdueAuthorizations();
    expect(db.get(7)).toBe(BrandAuthorizationStatus.REVOKED);
    expect(auditRepo.save).not.toHaveBeenCalled();
    expect(sms.sendSms).not.toHaveBeenCalled();
  });
});
