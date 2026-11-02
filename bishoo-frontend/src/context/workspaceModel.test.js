import { buildWorkspaces, initialWorkspaceKey, roleState, startOptionsFor, ROLE_STATE, ROLE_TOOLS, usableRecent } from './workspaceModel';
import { destinationForPage } from '../navigation/destinationRegistry';

const role = (id, roleType, extra = {}) => ({ accountRoleId: id, roleType, status: 'active', switchable: true, businessId: null, ...extra });

describe('Kazi workspace model (owner 2026-11-01)', () => {
  const roles = [
    role(1, 'buyer'),
    role(2, 'seller', { businessId: 10, businessName: 'Bishoo Electronics' }),
    role(3, 'agent'),
    role(4, 'super_agent', { businessId: 20, businessName: 'Samatta Transportation' }),
    role(5, 'transport_provider', { businessId: 20, businessName: 'Samatta Transportation' }),
  ];
  const businesses = [{ id: 10, legalName: 'Bishoo Electronics' }, { id: 20, tradingName: 'Samatta Transportation' }, { id: 30, legalName: 'Duka Jipya' }];

  it('one personal workspace, then one per business; two businesses never share tools', () => {
    const ws = buildWorkspaces(roles, businesses, 2);
    expect(ws.map((w) => w.title)).toEqual(['Binafsi', 'Bishoo Electronics', 'Duka Jipya', 'Samatta Transportation']);
    expect(ws[0].roles.map((r) => r.roleType)).toEqual(['agent']); // buyer is the account itself, not a card
    const bishoo = ws.find((w) => w.businessId === 10);
    expect(bishoo.roles.map((r) => r.roleType)).toEqual(['seller']);
    expect(bishoo.roles[0].isActive).toBe(true);
    const samatta = ws.find((w) => w.businessId === 20);
    expect(samatta.roles.map((r) => r.roleType)).toEqual(['super_agent', 'transport_provider']);
    expect(samatta.subtitle).toBe('Ofisi · Usafiri');
    expect(ws.find((w) => w.businessId === 30).roles).toEqual([]); // a business with no capability yet: "Anza"
  });

  it('opens on the workspace holding the active role, else Binafsi', () => {
    expect(initialWorkspaceKey(buildWorkspaces(roles, businesses, 4), 4)).toBe('business-20');
    expect(initialWorkspaceKey(buildWorkspaces(roles, businesses, 1), 1)).toBe('personal');
  });

  it('the state comes from the server: only an active, switchable role shows tools', () => {
    expect(roleState(role(1, 'seller'))).toBe(ROLE_STATE.ACTIVE);
    expect(roleState(role(1, 'seller', { status: 'pending' }))).toBe(ROLE_STATE.PENDING);
    expect(roleState(role(1, 'seller', { status: 'suspended' }))).toBe(ROLE_STATE.SUSPENDED);
    expect(roleState(role(1, 'seller', { status: 'rejected' }))).toBe(ROLE_STATE.REJECTED);
    expect(roleState(role(1, 'seller', { switchable: false }))).toBe(ROLE_STATE.UNAVAILABLE);
  });

  it('offers to start only roles not held yet; a pending one is held', () => {
    expect(startOptionsFor([role(1, 'buyer')]).map((o) => o.key)).toEqual(['seller', 'service_provider', 'agent', 'super_agent']);
    expect(startOptionsFor([role(1, 'buyer'), role(3, 'agent', { status: 'pending' })]).map((o) => o.key)).not.toContain('agent');
  });

  it('every tool opens a registered page', () => {
    Object.values(ROLE_TOOLS).flat().forEach((t) => expect(destinationForPage(t.destination)).not.toBeNull());
  });

  it('a recent tool of a role no longer active is not offered', () => {
    const ws = buildWorkspaces([role(2, 'seller', { businessId: 10, status: 'suspended' })], businesses, null);
    expect(usableRecent([{ key: 'seller.pos', accountRoleId: 2 }, { key: 'me.orders', accountRoleId: null }], ws))
      .toEqual([{ key: 'me.orders', accountRoleId: null }]);
  });
});

describe('hotel tools (owner 2026-11-02: they did not show on live)', () => {
  it('a food business is read from the word, not one exact value', () => {
    const { isFoodBusiness } = require('./workspaceModel');
    for (const c of ['food', 'Food', 'Hoteli', 'Hotel & Lodge', 'Restaurant', 'mgahawa', 'Cafe']) expect(isFoodBusiness(c)).toBe(true);
    for (const c of ['electronics', 'Barbershop', '', null, 'hardware']) expect(isFoodBusiness(c)).toBe(false);
  });
  it('the hotel tools open the kitchen and the menu of that exact business', () => {
    const { hotelTools } = require('./workspaceModel');
    expect(hotelTools(10).map((t) => [t.destination, t.params])).toEqual([['HotelKitchen', { businessId: 10 }], ['HotelMenuManager', { businessId: 10 }]]);
  });
});
