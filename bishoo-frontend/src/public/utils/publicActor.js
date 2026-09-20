// I2B: navigation/message rules for a server-resolved public actor
// (Moment/feed/story `business` object). The exact commerceProfileId is the
// only identity carried forward; an explicitly unresolved actor
// (actorResolved === false) is never navigated/messaged to a guessed profile
// -- a bare owner id would land on the owner's Personal profile.
export const isActorUnresolved = (biz) => biz?.actorResolved === false;

export const actorProfileParams = (biz) =>
  biz?.commerceProfileId ? { commerceProfileId: biz.commerceProfileId } : undefined;

export const canOpenActor = (biz) => !!biz?.id && !isActorUnresolved(biz);
