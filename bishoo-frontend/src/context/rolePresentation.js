const ROLE_PRESENTATION = {
  buyer: { type: 'personal', icon: '👤', link: 'ownerId' },
  seller: { type: 'business', icon: '🏪', link: 'sellerProfileId' },
  agent: { type: 'agent', icon: '🏍️', link: 'agentId' },
  super_agent: { type: 'hub', icon: '🏢', link: 'superAgentId' },
  transport_provider: { type: 'transport_provider', icon: '🚌', link: 'transportProviderId' },
  service_provider: { type: 'service_provider', icon: '🔧', link: null },
  admin: { type: 'personal', icon: '🛡️', link: 'ownerId' },
  manager: { type: 'personal', icon: '🛡️', link: 'ownerId' },
  customer_care: { type: 'personal', icon: '🎧', link: 'ownerId' },
  arbitrator: { type: 'personal', icon: '⚖️', link: 'ownerId' },
};

export const presentationForRole = (role, profiles = [], user = null) => {
  if (!role) return null;
  const meta = ROLE_PRESENTATION[role.roleType] || ROLE_PRESENTATION.buyer;
  const profileId = Number(role.profileId);
  let presentation = null;

  if (meta.link === 'ownerId') {
    presentation = profiles.find((p) => p.type === meta.type && Number(p.ownerId) === Number(role.userId || user?.id));
  } else if (meta.link) {
    presentation = profiles.find((p) => p.type === meta.type && Number(p[meta.link]) === profileId);
  }

  // Never infer authority from a loose profile-type match. If the explicit
  // server profile link cannot be enriched, retain a safe synthetic label.
  return {
    ...(presentation || {}),
    id: presentation?.id ?? null,
    accountRoleId: role.accountRoleId,
    roleType: role.roleType,
    profileType: role.profileType,
    profileId: role.profileId,
    contextVersion: role.contextVersion,
    capabilities: role.capabilities || [],
    switchable: role.switchable,
    status: role.status,
    type: meta.type,
    icon: meta.icon,
    // I2A: role.displayName/photoUrl are the CANONICAL acting identity,
    // resolved server-side by RoleContextService.resolveIdentity() -- for an
    // organizational role this is the exact Business's own name/logo, never
    // user.name (that was the root cause of an organizational Seller for
    // "Washing Machine TZ" rendering "Bob"). presentation?.displayName/
    // user?.name stay only as a defensive fallback for a role object that
    // predates this field (an older cached /auth/roles response, or a hand-
    // built test fixture) -- never consulted when the server already sent
    // an answer.
    // identityType === null (explicit, as opposed to undefined on an older
    // response) means the server declared this row's identity UNRESOLVED
    // (broken organizational chain) -- never substitute the User's name.
    displayName: role.identityType === null
      ? (role.displayName ?? role.roleType)
      : (role.displayName ?? presentation?.displayName ?? user?.name ?? role.roleType),
    photoUrl: role.identityType === null
      ? (role.photoUrl ?? null)
      : (role.photoUrl ?? presentation?.photoUrl ?? user?.avatarUrl ?? null),
    presentationResolved: !!presentation,
    // Multi-Business Authority — Business-First Frontend Stage 1. Passed
    // through verbatim from the server's own /auth/roles /auth/switch-role
    // response (RoleContextService.listRoles/resolveContext) -- never
    // computed or guessed here. null for every role not organizationally
    // bound (buyer, and any operational role not yet linked to a Business
    // workspace) -- a legitimate, permanent state, not a loading gap.
    businessId: role.businessId ?? null,
    businessName: role.businessName ?? null,
    workspaceId: role.workspaceId ?? null,
    // I2A: same "server already resolved it, never guess here" discipline
    // as businessId/businessName above.
    identityType: role.identityType ?? null,
    commerceProfileId: role.commerceProfileId ?? null,
  };
};

export const adaptAvailableRoles = (roles = [], profiles = [], user = null) =>
  roles.map((role) => presentationForRole(role, profiles, user));

export { ROLE_PRESENTATION };
