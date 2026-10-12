import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SuperAgentsService } from './super-agents.service';

// Training office mark ("ofisi ya mafunzo"): admin sets the office mark and
// hides its business profile in one transaction, then records who did it.
function service(row: any = { id: 7, businessName: 'Habibu shipping express', isTrainingOffice: false }) {
  const s: any = Object.create(SuperAgentsService.prototype);
  const m = { query: jest.fn(async (sql: string) => (/^\s*SELECT/.test(sql) ? (row ? [row] : []) : [])) };
  s.dataSource = { transaction: async (fn: any) => fn(m) };
  s.activityEvents = { record: jest.fn(async () => undefined) };
  return { s, m };
}

describe('training office mark', () => {
  it('marks the office and hides its business profile in the same transaction; records the admin', async () => {
    const { s, m } = service();
    await expect(s.setTrainingOffice(3, 7, true)).resolves.toEqual({ id: 7, isTrainingOffice: true, changed: true });
    const sqls = m.query.mock.calls.map(([sql, p]: any) => [sql.replace(/\s+/g, ' ').trim(), p]);
    expect(sqls[0][0]).toMatch(/FOR UPDATE/);
    expect(sqls).toContainEqual(['UPDATE public.super_agent SET "isTrainingOffice" = $2 WHERE id = $1', [7, true]]);
    expect(sqls).toContainEqual(['UPDATE public.commerce_profile SET "hiddenFromPublic" = $2 WHERE "superAgentId" = $1', [7, true]]);
    expect(s.activityEvents.record).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'SUPER_AGENT_MARKED_TRAINING', actorId: 3, actorType: 'admin', targetType: 'super_agent', targetId: 7 }));
  });

  it('removing the mark shows the office and its profile again', async () => {
    const { s, m } = service({ id: 7, businessName: 'Habibu', isTrainingOffice: true });
    await s.setTrainingOffice(3, 7, false);
    expect(m.query.mock.calls.some(([sql, p]: any) => /hiddenFromPublic/.test(sql) && p[1] === false)).toBe(true);
    expect(s.activityEvents.record).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'SUPER_AGENT_UNMARKED_TRAINING' }));
  });

  it('no change: no activity event', async () => {
    const { s } = service({ id: 7, businessName: 'Habibu', isTrainingOffice: true });
    await expect(s.setTrainingOffice(3, 7, true)).resolves.toMatchObject({ changed: false });
    expect(s.activityEvents.record).not.toHaveBeenCalled();
  });

  it('refuses anything but true/false, and an unknown office', async () => {
    await expect(service().s.setTrainingOffice(3, 7, 'yes')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service(null).s.setTrainingOffice(3, 99, true)).rejects.toBeInstanceOf(NotFoundException);
  });
});
