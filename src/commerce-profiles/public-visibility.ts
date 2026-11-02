/**
 * Profiles hidden from the public (commerce_profile."hiddenFromPublic",
 * migration 1791900000000): today the business profile of a training office
 * ("ofisi ya mafunzo"). Public profile pages, search and discovery never show
 * them; their own owner, staff and admins still can.
 */

/** SQL condition for a feed/Moment query: the post was not made by a hidden profile. */
export const NOT_FROM_HIDDEN_PROFILE = (alias: string) =>
  `NOT EXISTS (SELECT 1 FROM public.commerce_profile hp WHERE hp.id = ${alias}."commerceProfileId" AND hp."hiddenFromPublic" = true)`;

/**
 * SQL condition: who may see a feed post (owner 2026-11-01, Social Engagement phase A).
 * `public` posts are for everyone. `followers` (and the undecided `limited`, treated the same
 * until its meaning is settled) are for the author and for followers of the identity that
 * posted: a follow of that exact profile, or a legacy account follow when the post was made
 * as a business or carries no profile. A follower of someone's business never sees their
 * personal followers-only posts. `viewerParam` is bound to the viewer's user id (0 = nobody).
 */
export const VISIBLE_TO_VIEWER = (alias: string, viewerParam = 'feedViewerId') =>
  `(${alias}.visibility = 'public' OR ${alias}."businessId" = :${viewerParam}`
  + ` OR EXISTS (SELECT 1 FROM public.commerce_profile_follow vf WHERE vf."followerId" = :${viewerParam} AND vf."commerceProfileId" = ${alias}."commerceProfileId")`
  + ` OR (EXISTS (SELECT 1 FROM public.follow lf WHERE lf."followerId" = :${viewerParam} AND lf."sellerId" = ${alias}."businessId")`
  + ` AND (${alias}."commerceProfileId" IS NULL OR EXISTS (SELECT 1 FROM public.commerce_profile vp WHERE vp.id = ${alias}."commerceProfileId" AND vp.type = 'business'))))`;

/** Plain check for one post already loaded (same rule as VISIBLE_TO_VIEWER, for code paths). */
export const isPublicPost = (post: { visibility?: string | null }) => !post.visibility || post.visibility === 'public';

/**
 * Phase F (owner approved 2026-11-02): the viewer muted this post's identity. A mute names the
 * commerce profile, or the account for a post made without one. Mutes only change what the
 * person who muted sees; nobody else's feed changes. `viewerParam` is the viewer's user id.
 */
export const NOT_MUTED_BY_VIEWER = (alias: string, viewerParam = 'feedViewerId') =>
  `NOT EXISTS (SELECT 1 FROM public.profile_mute pm WHERE pm."userId" = :${viewerParam}`
  + ` AND (pm."mutedProfileId" = ${alias}."commerceProfileId"`
  + ` OR (${alias}."commerceProfileId" IS NULL AND pm."mutedUserId" = ${alias}."businessId")))`;
