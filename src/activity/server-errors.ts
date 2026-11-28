import { HttpException } from '@nestjs/common';

/** Only 5xx responses are platform errors. 4xx are the user's or the caller's mistake. */
export function serverErrorStatus(exception: unknown): number | null {
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    return status >= 500 ? status : null;
  }
  return 500; // any non-HTTP exception reaches the user as a 500
}

/**
 * Removes anything that could identify a person or carry a credential before an error
 * message is stored. Free text from users never reaches this function: only the error's
 * own message is kept, and it is cut to 300 characters after redaction.
 */
export function redactErrorMessage(raw: unknown): string {
  let text = String(raw ?? '');
  text = text.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]');
  text = text.replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[redacted-token]');
  text = text.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[redacted-email]');
  text = text.replace(/\+?\d[\d\s-]{7,}\d/g, '[redacted-number]');
  text = text.replace(/\s+/g, ' ').trim();
  return text.length > 300 ? `${text.slice(0, 297)}...` : text;
}

/** Route without the query string, so tokens or ids in ?query never get stored. */
export function routeWithoutQuery(url: string | undefined): string {
  return String(url || '').split('?')[0].slice(0, 200);
}

/** Feature name from the first path segment, e.g. /feed/moments -> "feed". */
export function featureFromRoute(route: string): string {
  const first = route.replace(/^\/+/, '').split('/')[0];
  return first ? first.toLowerCase().slice(0, 40) : 'root';
}

export function errorClassName(exception: unknown): string {
  if (exception && typeof exception === 'object' && (exception as any).name) {
    return String((exception as any).name).slice(0, 80);
  }
  return 'Error';
}
