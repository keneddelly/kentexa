/**
 * Profiles hidden from the public (commerce_profile."hiddenFromPublic",
 * migration 1791900000000): today the business profile of a training office
 * ("ofisi ya mafunzo"). Public profile pages, search and discovery never show
 * them; their own owner, staff and admins still can.
 */

/** SQL condition for a feed/Moment query: the post was not made by a hidden profile. */
export const NOT_FROM_HIDDEN_PROFILE = (alias: string) =>
  `NOT EXISTS (SELECT 1 FROM public.commerce_profile hp WHERE hp.id = ${alias}."commerceProfileId" AND hp."hiddenFromPublic" = true)`;
