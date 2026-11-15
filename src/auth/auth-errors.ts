import { HttpException } from '@nestjs/common';

/**
 * Sign-in and sign-up errors with a stable code (owner approved 2026-11-16, issue #361).
 * The page shows each code in the person's language (Swahili, English, French); `message`
 * stays in English for logs and older pages. Extra fields (remaining tries, whether the SMS
 * went out) ride along for the page to use.
 */
export type AuthErrorCode =
  | 'PHONE_TAKEN' | 'EMAIL_TAKEN' | 'ACCOUNT_NOT_FOUND' | 'ALREADY_VERIFIED'
  | 'OTP_TOO_MANY' | 'OTP_EXPIRED' | 'OTP_WRONG' | 'INVALID_CREDENTIALS' | 'ACCOUNT_NOT_VERIFIED';

export function authError<T extends HttpException>(
  Exc: new (body: any) => T, code: AuthErrorCode, message: string, extra: Record<string, unknown> = {},
): T {
  const status = new Exc(message).getStatus();
  return new Exc({ statusCode: status, code, message, ...extra });
}
