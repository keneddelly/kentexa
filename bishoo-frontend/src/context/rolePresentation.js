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
    displayName: presentation?.displayName || user?.name || role.roleType,
    photoUrl: presentation?.photoUrl || user?.avatarUrl || null,
    presentationResolved: !!presentation,
  };
};

export const adaptAvailableRoles = (roles = [], profiles = [], user = null) =>
  roles.map((role) => presentationForRole(role, profiles, user));

export { ROLE_PRESENTATION };
