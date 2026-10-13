import { WORK_ROLES, workRoleStatus, workRoleTarget } from './workRoles';

const verified = { status: 'verified' };
const waitingId = { status: 'pending' };

describe('work role status ("Fanya kazi na KenteXa")', () => {
  it('lists the four roles in order', () => {
    expect(WORK_ROLES.map((r) => r.key)).toEqual(['agent', 'office', 'seller', 'service']);
  });

  it('no request yet', () => {
    expect(workRoleStatus({ record: null, roleRow: null, identity: verified })).toBe('none');
  });

  it('a waiting request says the ID comes first when the ID is not verified yet', () => {
    expect(workRoleStatus({ record: { status: 'pending' }, identity: waitingId })).toBe('waiting_id');
    expect(workRoleStatus({ record: { status: 'pending' }, identity: { status: 'not_submitted' } })).toBe('waiting_id');
    expect(workRoleStatus({ record: { status: 'pending' }, identity: verified })).toBe('waiting');
    // a pending role row (office) with no record loaded yet
    expect(workRoleStatus({ roleRow: { status: 'pending' }, identity: waitingId })).toBe('waiting_id');
  });

  it('active, stopped and refused, from each table\'s own words', () => {
    expect(workRoleStatus({ record: { status: 'approved' }, identity: verified })).toBe('active'); // agent, seller
    expect(workRoleStatus({ record: { status: 'active' }, identity: verified })).toBe('active');   // office
    expect(workRoleStatus({ record: { status: 'blocked' }, identity: verified })).toBe('suspended');
    expect(workRoleStatus({ record: { status: 'rejected' }, identity: verified })).toBe('rejected');
  });

  it('an active or stopped role row wins over an older record', () => {
    expect(workRoleStatus({ record: { status: 'pending' }, roleRow: { status: 'active' }, identity: waitingId })).toBe('active');
    expect(workRoleStatus({ record: { status: 'approved' }, roleRow: { status: 'suspended' }, identity: verified })).toBe('suspended');
  });

  it('service provider has no request: active once the role exists', () => {
    expect(workRoleStatus({ roleRow: { status: 'active' }, identity: waitingId })).toBe('active');
    const service = WORK_ROLES.find((r) => r.key === 'service');
    expect(workRoleTarget(service, 'active')).toBe('MyServices');
    expect(workRoleTarget(service, 'none')).toBe('PostService');
    expect(workRoleTarget(WORK_ROLES[1], 'active')).toBe('BecomeSuperAgentInfo');
    expect(workRoleTarget(WORK_ROLES[2], 'none')).toBe('BecomeSeller'); // straight to the form, no info page
  });
});
