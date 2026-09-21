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
  // B6C — reuses MyServices.js (already business-context-aware: it scopes
  // to this exact Business via activeContext.businessId once this tile's
  // role is the active one) rather than a new dedicated dashboard page.
  service: [
    { key: 'service', labelKey: 'business_home.tile_service', icon: '🧰', roleType: 'service_provider', destination: 'MyServices' },
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

// I2C: CTA state for one Business capability, derived ONLY from the server's
// own reports for THIS Business (active capabilities from
// GET /business/:id/workspaces, application history from
// GET /business/:id/capability-applications). Never inferred from the
// user's role list, so a legacy unbound role can't make a Business look
// activated. 'active' hides the CTA (the capability tile takes over);
// 'pending' is inert; 'rejected'/'start' both open the apply page.
export const CTA_STATE = Object.freeze({ START: 'start', PENDING: 'pending', REJECTED: 'rejected', ACTIVE: 'active' });

export const capabilityCtaState = (code, workspaces = [], applications = []) => {
  if ((workspaces || []).some((ws) => (ws.capabilities || []).includes(code))) return CTA_STATE.ACTIVE;
  const mine = (applications || [])
    .filter((row) => row?.application?.capabilityCode === code)
    .sort((a, b) => Number(b.application.id) - Number(a.application.id));
  if (mine.length === 0) return CTA_STATE.START;
  if (mine[0].application.status === 'pending') return CTA_STATE.PENDING;
  if (mine[0].application.status === 'rejected') return CTA_STATE.REJECTED;
  return CTA_STATE.START;
};

export const CTA_CAPABILITIES = Object.freeze(['commerce', 'service', 'transport']);

// I2D: the exact-Business destination for a capability CTA. The Business id is
// the one BusinessHome resolved through the canonical entry rules; the
// server (I2C) still compares it with the acting context before creating
// anything.
export const ctaDestination = (code, businessId) =>
  code === 'service' ? `BecomeBusinessServiceProvider-${businessId}` : `BecomeBusinessCapability-${businessId}-${code}`;
