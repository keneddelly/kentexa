const ROLE_PRESENTATION = {
  buyer: { type: 'personal', icon: '👤', landingPage: 'Home', link: 'ownerId' },
  seller: { type: 'business', icon: '🏪', landingPage: 'SellerDashboard', link: 'sellerProfileId' },
  agent: { type: 'agent', icon: '🏍️', landingPage: 'AgentDashboard', link: 'agentId' },
  super_agent: { type: 'hub', icon: '🏢', landingPage: 'SuperAgentDashboard', link: 'superAgentId' },
  transport_provider: { type: 'transport_provider', icon: '🚌', landingPage: 'TransportProviderDashboard', link: 'transportProviderId' },
  service_provider: { type: 'service_provider', icon: '🔧', landingPage: 'MyServices', link: null },
  admin: { type: 'personal', icon: '🛡️', landingPage: 'Dashboard', link: 'ownerId' },
  manager: { type: 'personal', icon: '🛡️', landingPage: 'Dashboard', link: 'ownerId' },
  customer_care: { type: 'personal', icon: '🎧', landingPage: 'Home', link: 'ownerId' },
  arbitrator: { type: 'personal', icon: '⚖️', landingPage: 'Home', link: 'ownerId' },
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
    landingPage: meta.landingPage,
    presentationResolved: !!presentation,
  };
};

export const adaptAvailableRoles = (roles = [], profiles = [], user = null) =>
  roles.map((role) => presentationForRole(role, profiles, user));

export const landingPageForContext = (context) =>
  (ROLE_PRESENTATION[context?.roleType] || ROLE_PRESENTATION.buyer).landingPage;

export { ROLE_PRESENTATION };
