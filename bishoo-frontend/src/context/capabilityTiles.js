/**
 * capabilityTiles.js — Business-First Frontend Stage 1.
 *
 * Maps a workspace's server-issued `capabilities` (BusinessCapabilityCode
 * strings from GET /business/:id/workspaces) onto UI tiles. This is the
 * one place the frontend is allowed to know "which AccountRole roleType
 * corresponds to which capability" -- purely a LABEL/destination lookup,
 * never an authority decision. A tile only becomes actionable when the
 * workspace's own server-issued `myAccountRole` already names a specific,
 * switchable AccountRole for that roleType; this module never invents or
 * assumes one.
 *
 * BUSINESS CAPABILITY is not always ACCOUNT ROLE:
 *  - commerce  -> Seller operating authority (+ a POS feature tile riding
 *                 the same Seller authority -- POS is a feature surface
 *                 under Commerce, never its own AccountRole).
 *  - transport -> Transport Provider operating authority.
 *  - super_agent -> Super Agent operating authority.
 *  - cargo     -> a Business capability / feature domain with no backing
 *                 AccountRole at all today (no AGENT-style role exists
 *                 for it) -- always rendered as a "coming soon" tile,
 *                 never actionable, never switchRole-eligible.
 *
 * Agent is deliberately NOT represented here at all -- it remains a
 * personal/account-scoped role, not a Business capability, per the
 * approved architecture. Nothing in this module should ever be extended
 * to add an 'agent' capability tile without an explicit product/schema
 * decision (BusinessCapabilityCode has no AGENT value).
 */

export const TILE_STATE = Object.freeze({
  ACTIVE: 'active', // this tile's AccountRole is the CURRENTLY active context
  AVAILABLE: 'available', // actionable, not currently active
  PENDING: 'pending', // capability/workspace not active yet
  REQUIRES_ACTIVATION: 'requires_activation', // capability active, but no switchable AccountRole for it yet
  COMING_SOON: 'coming_soon', // no AccountRole concept exists for this capability at all (e.g. cargo)
});

// capabilityCode -> the tile(s) it produces. `roleType: null` marks a tile
// that can never be actionable (no AccountRole concept backs it).
const CAPABILITY_TILE_DEFS = {
  commerce: [
    { key: 'commerce', labelKey: 'business_home.tile_commerce', icon: '🛒', roleType: 'seller', destination: 'SellerDashboard' },
    { key: 'pos', labelKey: 'business_home.tile_pos', icon: '💳', roleType: 'seller', destination: 'POS' },
  ],
  transport: [
    { key: 'transport', labelKey: 'business_home.tile_transport', icon: '🚌', roleType: 'transport_provider', destination: 'TransportProviderDashboard' },
  ],
  super_agent: [
    { key: 'super_agent', labelKey: 'business_home.tile_super_agent', icon: '🏢', roleType: 'super_agent', destination: 'SuperAgentDashboard' },
  ],
  cargo: [
    { key: 'cargo', labelKey: 'business_home.tile_cargo', icon: '📦', roleType: null, destination: null },
  ],
};

/**
 * `workspace` is one entry from GET /business/:id/workspaces:
 *   { id, name, isDefault, status, capabilities: string[], myAccountRole: { accountRoleId, roleType } | null }
 * `activeAccountRoleId` is the CURRENT session's activeContext.accountRoleId,
 * used only to mark a tile ACTIVE vs AVAILABLE -- never to grant it.
 * `availableRoles` is the raw /auth/roles list, cross-checked so a tile is
 * only actionable when the server also reports that specific AccountRole
 * as switchable right now (e.g. not suspended since the workspaces call).
 */
export const tilesForWorkspace = (workspace, activeAccountRoleId, availableRoles = []) => {
  const capabilities = Array.isArray(workspace?.capabilities) ? workspace.capabilities : [];
  const myAccountRole = workspace?.myAccountRole || null;
  const switchableRoleIds = new Set(
    availableRoles.filter((r) => r.switchable === true).map((r) => Number(r.accountRoleId)),
  );

  const tiles = [];
  for (const code of capabilities) {
    const defs = CAPABILITY_TILE_DEFS[code];
    if (!defs) continue; // unknown/future capability code -- omit rather than guess a tile for it
    for (const def of defs) {
      if (def.roleType == null) {
        tiles.push({ ...def, state: TILE_STATE.COMING_SOON, accountRoleId: null });
        continue;
      }
      const matches = myAccountRole && myAccountRole.roleType === def.roleType;
      const accountRoleId = matches ? myAccountRole.accountRoleId : null;
      const isSwitchableNow = accountRoleId != null && switchableRoleIds.has(Number(accountRoleId));
      let state;
      if (!matches) {
        state = TILE_STATE.REQUIRES_ACTIVATION;
      } else if (!isSwitchableNow) {
        state = TILE_STATE.REQUIRES_ACTIVATION;
      } else if (Number(activeAccountRoleId) === Number(accountRoleId)) {
        state = TILE_STATE.ACTIVE;
      } else {
        state = TILE_STATE.AVAILABLE;
      }
      tiles.push({ ...def, state, accountRoleId: isSwitchableNow ? accountRoleId : null });
    }
  }
  return tiles;
};

export const isTileActionable = (tile) => tile.state === TILE_STATE.AVAILABLE || tile.state === TILE_STATE.ACTIVE;
