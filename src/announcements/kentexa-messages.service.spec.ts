import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { KentexaMessagesService, smsParts, smsText, SMS_PART_TZS } from './kentexa-messages.service';

/**
 * "Tuma taarifa" rules (owner 2026-11-09): admin and manager write; a manager's message to more
 * than 100 people, or any SMS from a manager, waits for admin; customer care may message one
 * person; every message lands in the person's Taarifa list with its in-app link.
 */
function build(userCount = 3) {
  const saved: any[] = [];
  const users = Array.from({ length: userCount }, (_, i) => ({ id: i + 1, phone: i % 2 ? null : `+25571000000${i}` }));
  const repo: any = {
    create: (x: any) => ({ ...x }),
    save: jest.fn(async (x: any) => { if (!x.id) { x.id = saved.length + 1; saved.push(x); } return x; }),
    update: jest.fn(async (where: any, patch: any) => {
      const id = typeof where === 'object' ? where.id : where;
      const row = saved.find((r) => r.id === id);
      if (!row || (where.status && row.status !== where.status)) return { affected: 0 };
      Object.assign(row, patch); return { affected: 1 };
    }),
    findOne: jest.fn(async ({ where }: any) => saved.find((r) => r.id === where.id) || null),
    find: jest.fn(async () => saved),
  };
  const userRepo: any = {
    find: jest.fn(async () => users),
    findOne: jest.fn(async ({ where }: any) => users.find((u) => u.id === where.id) ? { ...users.find((u) => u.id === where.id), name: 'Asha' } : null),
  };
  const roleRepo: any = { find: jest.fn(async () => [{ userId: 99 }]), createQueryBuilder: jest.fn() };
  const notifRepo: any = { insert: jest.fn(async (rows: any[]) => ({ identifiers: rows.map((_, i) => ({ id: 1000 + i })) })) };
  const inApp: any = { notify: jest.fn(async () => ({ id: 1 })) };
  const push: any = { sendToUser: jest.fn(async () => undefined) };
  const sms: any = { sendSms: jest.fn(async () => true) };
  const svc = new KentexaMessagesService(repo, userRepo, roleRepo, {} as any, notifRepo, {} as any, inApp, push, sms);
  return { svc, saved, notifRepo, inApp, push, sms };
}
const admin: any = { id: 99, name: 'Admin' };
const manager: any = { id: 50, name: 'Meneja' };
const draft = { title: 'Kipengele kipya', message: 'POS sasa ina Madeni.', audience: 'all', actionPage: 'POS' };

describe('Tuma taarifa', () => {
  it('admin message goes out now to everyone, with the in-app link', async () => {
    const { svc, notifRepo, push } = build(3);
    const a: any = await svc.create(admin, 'admin', draft);
    expect(a.status).toBe('sent');
    const rows = notifRepo.insert.mock.calls[0][0];
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ type: 'kentexa_message', sourceType: 'kentexa_message', actionPage: 'POS', title: 'Kipengele kipya', isRead: false });
    await new Promise((r) => setImmediate(r));
    expect(push.sendToUser).toHaveBeenCalledWith(1, expect.objectContaining({ url: '/?notificationId=1000' }));
  });

  it('a manager message to more than 100 people waits for admin; admin approval sends it', async () => {
    const { svc, notifRepo, inApp } = build(101);
    const a: any = await svc.create(manager, 'manager', draft);
    expect(a.status).toBe('pending_approval');
    expect(notifRepo.insert).not.toHaveBeenCalled();
    expect(inApp.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: 99, title: 'Taarifa inasubiri idhini yako' }));
    await expect(svc.approve(a.id, manager, 'manager')).rejects.toBeInstanceOf(ForbiddenException);
    const done: any = await svc.approve(a.id, admin, 'admin');
    expect(done.status).toBe('sent');
    expect(notifRepo.insert.mock.calls.flatMap((c: any) => c[0])).toHaveLength(101);
  });

  it('any SMS from a manager waits for admin, even to a few people', async () => {
    const { svc, sms } = build(3);
    const a: any = await svc.create(manager, 'manager', { ...draft, sendSms: true });
    expect(a.status).toBe('pending_approval');
    expect(sms.sendSms).not.toHaveBeenCalled();
  });

  it('a manager message to 100 or fewer without SMS goes out', async () => {
    const { svc } = build(100);
    const a: any = await svc.create(manager, 'manager', draft);
    expect(a.status).toBe('sent');
  });

  it('customer care: one person yes, a group no; finance and moderator cannot send', async () => {
    const { svc } = build(3);
    await expect(svc.create(manager, 'customer_care', draft)).rejects.toBeInstanceOf(ForbiddenException);
    const one: any = await svc.create(manager, 'customer_care', { ...draft, targetUserId: 1 });
    expect(one.status).toBe('sent');
    expect(one.targetUserName).toBe('Asha');
    await expect(svc.create(manager, 'finance', { ...draft, targetUserId: 1 })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.create(manager, 'moderator', draft)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('a later time waits for the clock; it is sent once', async () => {
    const { svc, notifRepo } = build(2);
    const later = new Date(Date.now() + 3600_000).toISOString();
    const a: any = await svc.create(admin, 'admin', { ...draft, scheduledAt: later });
    expect(a.status).toBe('scheduled');
    expect(notifRepo.insert).not.toHaveBeenCalled();
    await svc.sendNow(a.id);
    await svc.sendNow(a.id);
    expect(notifRepo.insert).toHaveBeenCalledTimes(1);
  });

  it('refuses a bad link and empty text', async () => {
    const { svc } = build(1);
    await expect(svc.create(admin, 'admin', { ...draft, actionPage: 'javascript:alert(1)' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.create(admin, 'admin', { ...draft, linkUrl: 'http://x.com' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.create(admin, 'admin', { ...draft, title: ' ' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('preview: people, phones and the SMS cost (TZS 22 a part)', async () => {
    const { svc } = build(4);
    const p = await svc.preview({ ...draft, sendSms: true }, 'manager');
    expect(p).toMatchObject({ recipients: 4, withPhone: 2, smsParts: 1, smsCostTzs: 2 * SMS_PART_TZS, needsApproval: true });
    expect(smsParts('x'.repeat(161))).toBe(2);
    expect(smsText({ title: 'A', message: 'B', linkUrl: null, actionPage: null } as any)).toBe('KenteXa: A\nB');
  });
});
