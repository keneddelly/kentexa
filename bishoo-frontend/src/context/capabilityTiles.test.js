import { tilesForWorkspace, TILE_STATE } from './capabilityTiles';

const availableRoles = [
  { accountRoleId: 38, roleType: 'seller', switchable: true },
  { accountRoleId: 45, roleType: 'transport_provider', switchable: true },
  { accountRoleId: 41, roleType: 'super_agent', switchable: false }, // e.g. suspended since the workspaces call
];

test('#5 Commerce capability maps to the seller AccountRole reported by the workspace, never guessed', () => {
  const ws = { id: 2, capabilities: ['commerce'], myAccountRole: { accountRoleId: 38, roleType: 'seller' } };
  const tiles = tilesForWorkspace(ws, null, availableRoles);
  const commerce = tiles.find((t) => t.key === 'commerce');
  expect(commerce.accountRoleId).toBe(38);
  expect(commerce.state).toBe(TILE_STATE.AVAILABLE);
});

test('#6 POS is a feature tile riding the Seller AccountRole, never its own AccountRole', () => {
  const ws = { id: 2, capabilities: ['commerce'], myAccountRole: { accountRoleId: 38, roleType: 'seller' } };
  const tiles = tilesForWorkspace(ws, null, availableRoles);
  const pos = tiles.find((t) => t.key === 'pos');
  expect(pos).toBeDefined();
  expect(pos.roleType).toBe('seller'); // same authority as Commerce, not a separate role
  expect(pos.accountRoleId).toBe(38);
  expect(pos.destination).toBe('POS');
});

test('#7 Cargo never invents an AccountRole — always coming_soon, never actionable', () => {
  const ws = { id: 9, capabilities: ['cargo'], myAccountRole: null };
  const tiles = tilesForWorkspace(ws, null, availableRoles);
  const cargo = tiles.find((t) => t.key === 'cargo');
  expect(cargo.roleType).toBeNull();
  expect(cargo.accountRoleId).toBeNull();
  expect(cargo.state).toBe(TILE_STATE.COMING_SOON);
});

test('#8 a capability with no switchable role for it shows requires_activation, never calls switchRole', () => {
  const wsNoRole = { id: 3, capabilities: ['transport'], myAccountRole: null };
  const tilesNoRole = tilesForWorkspace(wsNoRole, null, availableRoles);
  expect(tilesNoRole[0].state).toBe(TILE_STATE.REQUIRES_ACTIVATION);
  expect(tilesNoRole[0].accountRoleId).toBeNull();

  // myAccountRole exists but the server no longer reports it switchable (e.g. suspended)
  const wsSuspended = { id: 4, capabilities: ['super_agent'], myAccountRole: { accountRoleId: 41, roleType: 'super_agent' } };
  const tilesSuspended = tilesForWorkspace(wsSuspended, null, availableRoles);
  expect(tilesSuspended[0].state).toBe(TILE_STATE.REQUIRES_ACTIVATION);
  expect(tilesSuspended[0].accountRoleId).toBeNull();
});

test('a tile matching the currently active AccountRole is marked ACTIVE, not merely AVAILABLE', () => {
  const ws = { id: 2, capabilities: ['commerce'], myAccountRole: { accountRoleId: 38, roleType: 'seller' } };
  const tiles = tilesForWorkspace(ws, 38, availableRoles);
  expect(tiles.find((t) => t.key === 'commerce').state).toBe(TILE_STATE.ACTIVE);
  expect(tiles.find((t) => t.key === 'pos').state).toBe(TILE_STATE.ACTIVE);
});

test('#10 tiles never carry workspaceId as an authority field — only accountRoleId is switch-eligible', () => {
  const ws = { id: 2, workspaceId: 2, capabilities: ['commerce', 'transport'], myAccountRole: { accountRoleId: 38, roleType: 'seller' } };
  const tiles = tilesForWorkspace(ws, null, availableRoles);
  tiles.forEach((tile) => expect(tile.workspaceId).toBeUndefined());
});

test('an unknown/future capability code is omitted rather than guessed into a tile', () => {
  const ws = { id: 2, capabilities: ['something_new'], myAccountRole: null };
  expect(tilesForWorkspace(ws, null, availableRoles)).toEqual([]);
});
