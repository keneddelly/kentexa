import { WORK_ROLES, workRoleStatus, workRoleTarget, openWorkRole, openRolePage } from './workRoles';

const verified = { status: 'verified' };
const waitingId = { status: 'pending' };

describe('work role status ("Fanya kazi na KenteXa")', () => {
  it('lists the five roles in order (Msafirishaji last)', () => {
    expect(WORK_ROLES.map((r) => r.key)).toEqual(['agent', 'office', 'seller', 'service', 'transport']);
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

describe('service provider status from their own ads (decision S1)', () => {
  const { serviceRecordFromAds } = require('./workRoles');
  const service = WORK_ROLES.find((r) => r.key === 'service');
  it('no ads: no request; a live ad: active; only ads waiting for the ID: waiting for the ID', () => {
    expect(serviceRecordFromAds([])).toBeNull();
    expect(serviceRecordFromAds([{ status: 'active', waitingForId: false }])).toEqual({ status: 'active' });
    expect(serviceRecordFromAds([{ status: 'active', waitingForId: true }])).toEqual({ status: 'pending' });
  });
  it('a waiting ad wins over an active role row (the ad is not live yet)', () => {
    const record = serviceRecordFromAds([{ status: 'active', waitingForId: true }]);
    expect(workRoleStatus({ record, roleRow: { status: 'active' }, identity: { status: 'pending' }, recordWins: service.recordWins })).toBe('waiting_id');
    expect(workRoleStatus({ record: null, roleRow: { status: 'active' }, identity: { status: 'pending' }, recordWins: service.recordWins })).toBe('active');
  });
});

describe('Msafirishaji status (transport provider record)', () => {
  const transport = WORK_ROLES.find((r) => r.key === 'transport');
  it('pending -> waiting (or waiting for the ID); verified/active -> active; suspended/inactive -> suspended', () => {
    expect(workRoleStatus({ record: { status: 'pending' }, identity: verified })).toBe('waiting');
    expect(workRoleStatus({ record: { status: 'pending' }, identity: waitingId })).toBe('waiting_id');
    expect(workRoleStatus({ record: { status: 'verified' }, identity: verified })).toBe('active');
    expect(workRoleStatus({ record: { status: 'inactive' }, identity: verified })).toBe('suspended');
    expect(workRoleTarget(transport, 'none')).toBe('BecomeTransportProvider');
    expect(workRoleTarget(transport, 'active')).toBe('TransportProviderDashboard');
  });
});

describe('opening a role whose page only works inside the role', () => {
  const transport = WORK_ROLES.find((r) => r.key === 'transport');
  const service = WORK_ROLES.find((r) => r.key === 'service');
  const open = (role, status, roleRow) => {
    const onNavigate = jest.fn(), onSwitchAccountRole = jest.fn();
    openWorkRole({ role, status, roleRow, onNavigate, onSwitchAccountRole });
    return { onNavigate, onSwitchAccountRole };
  };

  test('active Msafirishaji: switches to the transport role and opens its dashboard', () => {
    const r = open(transport, 'active', { roleType: 'transport_provider', status: 'active', accountRoleId: 45 });
    expect(r.onSwitchAccountRole).toHaveBeenCalledWith(45, 'TransportProviderDashboard');
    expect(r.onNavigate).not.toHaveBeenCalled();
  });

  test('active record but no active role row yet: the status page, not a page that bounces home', () => {
    expect(open(transport, 'active', null).onNavigate).toHaveBeenCalledWith('BecomeTransportProvider');
    expect(open(transport, 'active', { status: 'pending', accountRoleId: 45 }).onSwitchAccountRole).not.toHaveBeenCalled();
  });

  test('waiting Msafirishaji opens the form/status page; other roles just navigate', () => {
    expect(open(transport, 'waiting', null).onNavigate).toHaveBeenCalledWith('BecomeTransportProvider');
    const s = open(service, 'active', { status: 'active', accountRoleId: 9 });
    expect(s.onNavigate).toHaveBeenCalledWith('MyServices');
    expect(s.onSwitchAccountRole).not.toHaveBeenCalled();
  });
});

describe('dashboard buttons on the Wakala and Ofisi status pages', () => {
  const roles = [{ roleType: 'agent', status: 'active', accountRoleId: 7 }, { roleType: 'super_agent', status: 'pending', accountRoleId: 8 }];
  test('switch into the active role, then open its dashboard', () => {
    const onNavigate = jest.fn(), onSwitchAccountRole = jest.fn();
    openRolePage({ roleType: 'agent', page: 'AgentDashboard', availableRoles: roles, onNavigate, onSwitchAccountRole });
    expect(onSwitchAccountRole).toHaveBeenCalledWith(7, 'AgentDashboard');
    expect(onNavigate).not.toHaveBeenCalled();
  });
  test('a role row that is not active is not switched into', () => {
    const onNavigate = jest.fn(), onSwitchAccountRole = jest.fn();
    openRolePage({ roleType: 'super_agent', page: 'SuperAgentDashboard', availableRoles: roles, onNavigate, onSwitchAccountRole });
    expect(onSwitchAccountRole).not.toHaveBeenCalled();
    expect(onNavigate).toHaveBeenCalledWith('SuperAgentDashboard');
  });
});
