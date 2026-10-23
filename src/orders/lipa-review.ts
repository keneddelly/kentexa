/**
 * Lipa Namba payment review (owner 2026-10-23). Pure: no database, no clock.
 *
 * The buyer pays the seller's own Lipa Namba and sends a screenshot. KenteXa never
 * holds the money, so only the seller can say whether it arrived:
 *   - confirmed: the order is paid; a digital product unlocks for download.
 *   - rejected (with a reason): the buyer is told and can send a new screenshot.
 */
import { smsSafeName } from '../super-agents/customer-parcel-number';

export const LIPA_REJECT_REASONS = ['amount_wrong', 'not_received', 'unclear'] as const;
export type LipaRejectReason = (typeof LIPA_REJECT_REASONS)[number];
export type LipaDecision = 'confirmed' | 'rejected' | null;

/** Plain Swahili, shown to the buyer and in the buyer's SMS. */
export const LIPA_REASON_TEXT: Record<LipaRejectReason, string> = {
  amount_wrong: 'kiasi hakilingani na bei',
  not_received: 'pesa haijaonekana kwenye Lipa Namba',
  unclear: 'picha haisomeki',
};

export const LIPA_REVIEW_MESSAGES = {
  notLipa: 'Agizo hili halikulipwa kwa Lipa Namba.',
  notYours: 'Agizo hili ni la muuzaji mwingine.',
  notBuyer: 'Agizo hili si lako.',
  alreadyConfirmed: 'Malipo ya agizo hili yameshathibitishwa.',
  notRejected: 'Picha mpya inahitajika tu malipo yakikataliwa.',
  badReason: 'Chagua sababu: kiasi si sahihi, pesa haijaonekana, au picha haisomeki.',
  cancelled: 'Agizo hili limesitishwa.',
  notReady: 'Huduma hii bado haijawashwa. Jaribu tena baadaye.',
} as const;

export const isRejectReason = (v: unknown): v is LipaRejectReason =>
  typeof v === 'string' && (LIPA_REJECT_REASONS as readonly string[]).includes(v);

const tzs = (n: number) => `TZS ${Math.round(Number(n) || 0).toLocaleString('en-US')}`;
const shop = (name: string | null | undefined) => smsSafeName(name).slice(0, 30) || 'Muuzaji';

/** Buyer SMS when the seller confirms. One part, plain characters. */
export function lipaConfirmedSms(input: { shopName?: string | null; orderId: number; amount: number; digital: boolean }): string {
  const next = input.digital ? ' Pakua bidhaa yako: KenteXa > Oda zangu.' : ' Oda inaandaliwa.';
  return `${shop(input.shopName)}: Tumepokea malipo yako ${tzs(input.amount)} ya oda #${input.orderId}.${next}`;
}

/** Buyer SMS when the seller rejects. One part, plain characters. */
export function lipaRejectedSms(input: { shopName?: string | null; orderId: number; reason: LipaRejectReason }): string {
  return `${shop(input.shopName)}: Malipo ya oda #${input.orderId} hayajathibitishwa (${LIPA_REASON_TEXT[input.reason]}). `
    + 'Tuma picha mpya: KenteXa > Oda zangu.';
}

/** What a viewer may do with the order's payment, from its state. */
export function lipaReviewActions(input: { decision: LipaDecision; cancelled: boolean; viewer: 'seller' | 'buyer' }) {
  if (input.cancelled) return { canConfirm: false, canReject: false, canResend: false };
  return {
    canConfirm: input.viewer === 'seller' && input.decision !== 'confirmed',
    canReject: input.viewer === 'seller' && input.decision === null,
    canResend: input.viewer === 'buyer' && input.decision === 'rejected',
  };
}
