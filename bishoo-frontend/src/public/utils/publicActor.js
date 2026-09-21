// I2B: navigation/message rules for a server-resolved public actor
// (Moment/feed/story `business` object). The exact commerceProfileId is the
// only identity carried forward; an explicitly unresolved actor
// (actorResolved === false) is never navigated/messaged to a guessed profile
// -- a bare owner id would land on the owner's Personal profile.
export const isActorUnresolved = (biz) => biz?.actorResolved === false;

export const actorProfileParams = (biz) =>
  biz?.commerceProfileId ? { commerceProfileId: biz.commerceProfileId } : undefined;

export const canOpenActor = (biz) => !!biz?.id && !isActorUnresolved(biz);

// I2 correction: the acting profile a Moment is published as. ONLY the
// server-resolved canonical commerceProfileId of the active context is ever
// sent -- never the legacy presentation profile id (activeProfile.id), which
// for a legacy unbound Seller is a stale Business profile. A legacy unbound
// Seller stays PERSONAL: its canonical profile is the Personal one, and when
// none is resolvable nothing is sent (the server then fails explicitly rather
// than accepting a client-selected identity).
export const momentActorProfileId = (activeProfile) => activeProfile?.commerceProfileId ?? undefined;

export const buildProductMomentPayload = (product, activeProfile) => ({
  type: 'moment',
  title: product.name,
  body: null,
  imageUrl: product.images?.[0] || null,
  linkedEntityType: 'product',
  linkedEntityId: product.id,
  commerceProfileId: momentActorProfileId(activeProfile),
});

// I2 legacy-Business transition. Presentation of the ACTIVE actor, always from the
// canonical server identity (activeProfile.displayName / actorKind) -- never from
// user.storeName, seller_profile.businessName or a legacy profile id.
export const PERSONAL_OPERATIONAL_KEY = {
  seller: 'actor_label.selling_personal',
  transport_provider: 'actor_label.transport_personal',
  super_agent: 'actor_label.hub_personal',
  agent: 'actor_label.agent_personal',
  service_provider: 'actor_label.service_personal',
};

// "Bob · Selling · Personal" for an unbound operational role; the plain name otherwise.
export const personalOperationalText = (profile, t) =>
  profile?.actorKind === 'PERSONAL_OPERATIONAL'
    ? `${profile.displayName} · ${t(PERSONAL_OPERATIONAL_KEY[profile.roleType] || 'actor_label.personal')}`
    : profile?.displayName;

// { title, subtitle } for "Posting as ..." style labels.
export const actorLabelParts = (profile, t) => {
  if (!profile) return null;
  if (profile.actorKind === 'BUSINESS') return { title: profile.displayName, subtitle: t('actor_label.business') };
  if (profile.actorKind === 'PERSONAL_OPERATIONAL') {
    return { title: profile.displayName, subtitle: t(PERSONAL_OPERATIONAL_KEY[profile.roleType] || 'actor_label.personal') };
  }
  if (profile.actorKind === 'PERSONAL') return { title: profile.displayName, subtitle: t('actor_label.personal') };
  return { title: profile.displayName, subtitle: null };
};

// Legacy unbound operational Seller: an owner may connect selling to a Business.
export const isLegacyPersonalSeller = (role) =>
  role?.roleType === 'seller' && role?.identityType === 'PERSONAL' && role?.businessId == null;

// Who a comment/reply is displayed as. authorId is authoritative:
//  - comment stamped with a canonical CommerceProfile -> that profile (unchanged behavior);
//  - NO CommerceProfile (a Personal account that has none) -> ONLY the Personal user
//    identity of the author: name + avatar. Never storeName / logo / any business branding,
//    and never a guessed or first-found profile.
export const commenterIdentity = (comment) => {
  const author = comment?.author;
  const profile = comment?.commerceProfile;
  if (profile) {
    return {
      name: profile.displayName || author?.storeName || author?.name,
      photo: profile.photoUrl || author?.avatarUrl || author?.logo,
    };
  }
  return { name: author?.name, photo: author?.avatarUrl };
};
