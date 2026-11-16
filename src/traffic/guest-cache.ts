import { CallHandler, ExecutionContext, Injectable, NestInterceptor, UseInterceptors, applyDecorators } from '@nestjs/common';
import { Observable, of, tap } from 'rxjs';
import { spikeMode } from './spike-mode.service';

/**
 * Traffic step 2 (issue #368, owner approved 2026-11-16): public pages that every signed-out
 * visitor sees the same way (Home feed, trending, topics, tag pages) are answered from memory for
 * a few seconds instead of asking the database again for each visitor. Signed-in people are
 * never cached: their feed is their own. Twice as long in spike mode.
 *
 * In memory of this process, at most 300 answers; the oldest go first.
 */
const MAX_ENTRIES = 300;
const store = new Map<string, { until: number; body: unknown }>();

export const __clearGuestCacheForTests = () => store.clear();

const isGuest = (req: any) => !req?.headers?.authorization;

@Injectable()
export class GuestCacheInterceptor implements NestInterceptor {
  constructor(private readonly seconds: number) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest();
    const res = http.getResponse();
    if (req?.method !== 'GET' || !isGuest(req)) return next.handle();
    const ttl = this.seconds * (spikeMode.isOn() ? 2 : 1);
    const key = String(req.originalUrl || req.url || '');
    const now = Date.now();
    const hit = store.get(key);
    if (hit && hit.until > now) {
      res?.setHeader?.('X-Cache', 'HIT');
      res?.setHeader?.('Cache-Control', `public, max-age=${ttl}`);
      return of(hit.body);
    }
    return next.handle().pipe(tap((body) => {
      if (res?.statusCode && res.statusCode >= 400) return;
      if (store.size >= MAX_ENTRIES) {
        const oldest = store.keys().next().value;
        if (oldest !== undefined) store.delete(oldest);
      }
      store.delete(key);
      store.set(key, { until: Date.now() + ttl * 1000, body });
      res?.setHeader?.('X-Cache', 'MISS');
      res?.setHeader?.('Cache-Control', `public, max-age=${ttl}`);
    }));
  }
}

/** Cache this GET for signed-out visitors for `seconds` (30 by default). */
export const GuestCache = (seconds = 30) => applyDecorators(UseInterceptors(new GuestCacheInterceptor(seconds)));
