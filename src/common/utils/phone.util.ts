// Tanzanian phone numbers are stored canonically as "255XXXXXXXXX" (no
// leading +, no leading 0) — Register.js has always converted a leading 0
// to 255 before sending, so every account created through the normal signup
// flow is already stored that way. Login/OTP/password-reset never applied
// the same conversion, so typing the same number back with a 0 instead of
// 255 looked up a value that was never stored and failed with a generic
// "invalid credentials" — not a wrong password, just the wrong shape of the
// same number. Applying this at every phone lookup (and on write, for any
// caller that skips the frontend's own formatting) makes 0-prefixed,
// 255-prefixed, and +255-prefixed input all resolve to the same account.
export function normalizeTzPhone(phone: string): string {
  const digits = phone.trim().replace(/\D/g, '');
  if (digits.startsWith('255')) return digits;
  if (digits.startsWith('0')) return '255' + digits.slice(1);
  return digits;
}
