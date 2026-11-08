/**
 * SMS budget (owner 2026-11-08: "there are many messages sent, this could kill the KenteXa SMS
 * budget; kill SMS for now, only push notifications and phone calling").
 *
 * By default only CODES are sent by SMS: login / sign-up OTPs, pickup and delivery handover codes,
 * claim codes (every call that marks its message `sensitive`). Without them a person cannot log in
 * or hand a parcel over. Everything else (job offers, order and parcel updates, reminders,
 * statements, welcome) goes by in-app + push only. SMS_SEND_ALL=1 brings every SMS back.
 */
export function smsSendAll(env: NodeJS.ProcessEnv = process.env): boolean {
  return String(env.SMS_SEND_ALL ?? '').trim() === '1';
}

/** May this message go out by SMS now? Codes always; the rest only when SMS_SEND_ALL=1. */
export function smsAllowed(isCode: boolean, env: NodeJS.ProcessEnv = process.env): boolean {
  return isCode || smsSendAll(env);
}
