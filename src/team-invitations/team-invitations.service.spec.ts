import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { TeamInvitationsService } from './team-invitations.service';

// Owner approved 2026-11-03: nobody joins a team without saying yes, and only with the invited number.
const ROW = { id: 7, token: 'abcdefghijklmnopqrstuvwx', status: 'pending', phone: '255712345678', name: 'Asha', role: 'sales',
  permissions: { canOperatePOS: true }, commerceProfileId: 5, ownerId: 10, invitedByUserId: 10, businessName: 'BiS' };

function make(row: any = ROW) {
  const calls: string[] = [];
  const m = { query: jest.fn(async (sql: string) => { calls.push(sql); return sql.includes('FOR UPDATE') ? [{ status: 'pending' }] : []; }) };
  const db: any = {
    query: jest.fn(async (sql: string) => (sql.includes('to_regclass') ? [{ ok: true }] : sql.includes('WHERE i.token') ? [row] : [])),
    transaction: jest.fn(async (fn: any) => fn(m)),
  };
  const notify: any = { notify: jest.fn(async () => ({})) };
  return { s: new TeamInvitationsService(db, notify), calls, notify };
}

describe('TeamInvitationsService.respond', () => {
  it('refuses an account with another number', async () => {
    const { s } = make();
    await expect(s.respond(ROW.token, { id: 20, phone: '255799999999' }, true)).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('Kubali joins both teams (Timu and the POS team) and tells the owner', async () => {
    const { s, calls, notify } = make();
    const r = await s.respond(ROW.token, { id: 20, name: 'Asha', phone: '0712345678' }, true);
    expect(r.status).toBe('accepted');
    expect(calls.some((q) => q.includes('INSERT INTO public.commerce_profile_member'))).toBe(true);
    expect(calls.some((q) => q.includes('INSERT INTO public.business_team_member'))).toBe(true);
    expect(notify.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: 10, title: 'Asha amejiunga na timu' }));
  });
  it('Kataa joins nothing', async () => {
    const { s, calls } = make();
    await s.respond(ROW.token, { id: 20, name: 'Asha', phone: '255712345678' }, false);
    expect(calls.some((q) => q.includes('INSERT INTO'))).toBe(false);
  });
  it('an answered invitation cannot be used again', async () => {
    const { s } = make({ ...ROW, status: 'accepted' });
    await expect(s.respond(ROW.token, { id: 20, phone: '255712345678' }, true)).rejects.toBeInstanceOf(BadRequestException);
  });
});
