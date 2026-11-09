import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { ActivityEventService } from './activity-event.service';
import { ActivityCategory } from './entities/activity-event.entity';

/**
 * Global: every change made on KenteXa is recorded (owner 2026-11-09: "make admin recognize each
 * action taken by user ... admin is the mirror of KenteXa ... we don't need to rely on checking
 * the back-end"). One ActivityEvent `ACTION` per successful POST / PATCH / PUT / DELETE:
 *   who (actor, the role they acted as, their business), what (method + route pattern, e.g.
 *   PATCH /orders/:id/cancel), on what (the ids in the path), result (HTTP status), how long.
 * Never the request body or the response (no passwords, codes, messages, ID numbers or money
 * details are copied); never reads (GET) or the high-frequency / search-like calls below.
 * Fire-and-forget: recording can never slow down or break the real request.
 * The named domain events (ORDER_PLACED, MOMENT_CREATED, ...) stay as they are; this adds the
 * trail for everything else, so nothing a person does is invisible to the admin.
 */
const MUTATING = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

// Not actions a person takes (polling, pings, searches, previews, webhooks, token refresh).
export const SKIP_ROUTE = /(^|\/)(webhook|refresh|heartbeat|ping|location|online|presence|typing|seen|read|track|analytics|search|discover|explain|preview|estimate|calculate|quote|remind-check|activity)(\/|$)|^\/?auth\/(refresh|check)/i;

const CATEGORY_BY_PREFIX: Array<[RegExp, ActivityCategory]> = [
  [/^(auth|otp|password)/, ActivityCategory.AUTH],
  [/^identity/, ActivityCategory.VERIFICATION],
  [/^(users|profile|me)\b/, ActivityCategory.IDENTITY],
  [/^(admin|admin-intelligence)/, ActivityCategory.SYSTEM],
  [/^(business|commerce-profiles|seller|selling-capability|team-invitations|partner-invitations|seller-agent-partners|advertisers)/, ActivityCategory.BUSINESS],
  [/^(products|classifieds|services|service-providers|brands|brand-authorizations|official-products|warranty|announcements)/, ActivityCategory.CONTENT],
  [/^(feed|moments|posts|communities|social|comments|reactions|polls|follows?)/, ActivityCategory.SOCIAL],
  [/^(conversations|messages|inbox|chat|contact)/, ActivityCategory.MESSAGING],
  [/^(orders|cart|checkout|food-orders|hotel|pos|quote-requests|disputes)/, ActivityCategory.COMMERCE],
  [/^(payments|payouts|wallet|kentexa-fee|collection-fees)/, ActivityCategory.PAYMENT],
  [/^invoices/, ActivityCategory.INVOICE],
  [/^agents/, ActivityCategory.AGENT],
  [/^(transport|van-pilot)/, ActivityCategory.TRANSPORT],
  [/^(shipments|shipping|parcels|parcel-collections|super-agents|pickup-tasks|boda-rates|dispatch-reminders|daily-batches|routes|zones)/, ActivityCategory.LOGISTICS],
  [/^(reviews|reputation)/, ActivityCategory.REPUTATION],
];

export function categoryForRoute(route: string): ActivityCategory {
  const first = String(route || '').replace(/^\/+/, '');
  for (const [re, cat] of CATEGORY_BY_PREFIX) if (re.test(first)) return cat;
  return ActivityCategory.SYSTEM;
}

/** Path ids only: numbers and short plain codes, never long free text. */
export function safeParams(params: Record<string, unknown> | undefined): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(params || {})) {
    const s = String(v ?? '');
    if (/^\d{1,12}$/.test(s)) out[k] = Number(s);
    else if (/^[\w.-]{1,40}$/.test(s)) out[k] = s;
  }
  return out;
}

@Injectable()
export class ActionRecorderInterceptor implements NestInterceptor {
  constructor(private readonly events: ActivityEventService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType() !== 'http') return next.handle();
    const http = context.switchToHttp();
    const req = http.getRequest();
    const method = String(req?.method || '').toUpperCase();
    if (!MUTATING.has(method)) return next.handle();
    const route = `${req.baseUrl || ''}${req.route?.path || ''}` || String(req.path || '').replace(/\/\d+(?=\/|$)/g, '/:id');
    if (SKIP_ROUTE.test(route)) return next.handle();
    const started = Date.now();
    return next.handle().pipe(tap({
      next: (body) => {
        try {
          // Sign-in and sign-up have no user on the request yet: the id from the reply (id only).
          const actorId = Number(req.user?.id) || Number(body?.user?.id) || null;
          if (!actorId) return;
          const role = req.roleContext || null;
          const params = safeParams(req.params);
          const firstId = Object.values(params).find((v) => typeof v === 'number') as number | undefined;
          void this.events.record({
            eventType: 'ACTION',
            category: categoryForRoute(route),
            actorId,
            actorType: role?.roleType ?? null,
            actorProfileId: Number.isSafeInteger(role?.profileId) ? role.profileId : null,
            actorProfileType: role?.profileType ?? null,
            businessId: Number.isSafeInteger(role?.businessId) ? role.businessId : null,
            targetType: route.replace(/^\/+/, '').split('/')[0] || null,
            targetId: firstId ?? null,
            metadata: { method, route, params, status: http.getResponse()?.statusCode ?? null, ms: Date.now() - started },
            severity: method === 'DELETE' ? 'warning' : /^\/?admin|\/admin(\/|$)/.test(route) ? 'notice' : 'info',
            visibility: 'admin',
          });
        } catch { /* never break the request */ }
      },
    }));
  }
}
