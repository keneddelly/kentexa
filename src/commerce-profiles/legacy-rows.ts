/**
 * Owner 2026-11-02: "I created another business called ABC hotel on the same account that has
 * BIS ... I can see BIS orders on ABC". Rows made before a row knew its identity carry no
 * commerceProfileId. They were shown to EVERY profile of the account, so a second business
 * saw the first business's orders, products, listings and payouts.
 *
 * One rule now: an unstamped row belongs to the account's ORIGINAL identities only (its
 * personal profile and its first business profile), as before. A business profile opened
 * later never takes them. `cpidParam` names the query parameter that holds the profile id.
 */
export const LEGACY_ROWS_FOR = (cpidParam: string) =>
  `NOT EXISTS (SELECT 1 FROM public.commerce_profile lr_new WHERE lr_new.id = :${cpidParam}`
  + ` AND lr_new.type::text = 'business' AND EXISTS (SELECT 1 FROM public.commerce_profile lr_old`
  + ` WHERE lr_old."ownerId" = lr_new."ownerId" AND lr_old.type::text = 'business' AND lr_old.id < lr_new.id))`;

/** `alias."commerceProfileId" IS NULL`, limited by the rule above. */
export const UNSTAMPED_FOR = (alias: string, cpidParam: string) =>
  `(${alias}."commerceProfileId" IS NULL AND ${LEGACY_ROWS_FOR(cpidParam)})`;
