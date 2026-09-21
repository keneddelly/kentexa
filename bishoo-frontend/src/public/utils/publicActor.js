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
