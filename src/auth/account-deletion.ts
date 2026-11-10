/**
 * Futa akaunti (owner approved 2026-11-10, Google Play account-deletion rule): a signed-in person
 * deletes their own account. One SMS (or email) code confirms it is really them. The account then
 * closes at once and its personal data is erased; order, invoice and payment records stay for the
 * 7 years the law asks, without the person's name or phone (privacy policy section 7).
 */

// Orders still moving: the account cannot be deleted until they are finished or cancelled.
export const OPEN_ORDER_STATUSES = ['paid', 'preparing', 'ready_for_pickup', 'in_transit', 'disputed'];

export const DELETED_NAME = 'Akaunti iliyofutwa';

/** The personal fields of the user row, emptied. The row itself stays so old orders keep their link. */
export const erasedUserFields = (randomPasswordHash: string) => ({
  name: DELETED_NAME,
  phone: null,
  email: null,
  password: randomPasswordHash,
  avatarUrl: null,
  otp: null,
  otpExpiry: null,
  otpAttempts: 0,
  isVerified: false,
  storeName: null,
  storeWhatsApp: null,
  payoutMethod: null,
  payoutAccountName: null,
  payoutAccountNumber: null,
  payoutBankName: null,
  payoutBranchName: null,
  storeTagline: null,
  storeDescription: null,
  logo: null,
  coverImage: null,
  businessLocation: null,
  sellerPickupAddress: null,
  businessHours: null,
  bio: null,
  city: null,
  interests: null,
});

/** What else is switched off: everything the person showed publicly. Each runs with $1 = user id. */
export const HIDE_PUBLIC_SQL: string[] = [
  `UPDATE public.product SET "isActive" = false, "isAvailable" = false WHERE "sellerId" = $1`,
  `UPDATE public.classified SET status = 'expired' WHERE "sellerId" = $1 AND status = 'active'`,
  `UPDATE public.service_ad SET status = 'inactive' WHERE "providerId" = $1`,
  `UPDATE public.business_feed_item SET "isActive" = false WHERE "businessId" = $1`,
  `UPDATE public.commerce_profile SET "hiddenFromPublic" = true WHERE "ownerId" = $1`,
  `UPDATE public.resale_offer SET "isActive" = false WHERE "resellerUserId" = $1`,
  `DELETE FROM public.notification WHERE "userId" = $1`,
];

export const maskContact = (phone?: string | null, email?: string | null): string => {
  if (phone) return `${String(phone).slice(0, 3)}****${String(phone).slice(-3)}`;
  if (email) { const [a, d] = String(email).split('@'); return `${a.slice(0, 2)}***@${d || ''}`; }
  return '';
};
