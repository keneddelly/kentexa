import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ActivityEventService } from './activity-event.service';
import { ActivityCategory } from './entities/activity-event.entity';
import {
  errorClassName,
  featureFromRoute,
  redactErrorMessage,
  routeWithoutQuery,
  serverErrorStatus,
} from './server-errors';

/**
 * Error Watch, slice 1 (owner-approved spec, 2026-11-28): every 5xx response is recorded
 * as a SERVER_ERROR activity event (admin-only). The user's response is unchanged:
 * same status, same body as Nest's default. Recording never throws.
 */
@Catch()
export class ServerErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(ServerErrorFilter.name);

  constructor(private readonly events: ActivityEventService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse();
    const req = ctx.getRequest();

    const status = serverErrorStatus(exception);
    if (status !== null) {
      const route = routeWithoutQuery(req?.originalUrl || req?.url);
      const rawMessage = exception instanceof Error ? exception.message : String(exception);
      this.events.record({
        eventType: 'SERVER_ERROR',
        category: ActivityCategory.SYSTEM,
        actorId: req?.user?.id ?? null,
        actorType: req?.user?.id ? 'user' : 'visitor',
        targetType: 'route',
        metadata: {
          method: String(req?.method || '').toUpperCase(),
          route,
          feature: featureFromRoute(route),
          status,
          errorClass: errorClassName(exception),
          message: redactErrorMessage(rawMessage),
        },
        severity: 'error',
        visibility: 'system',
        requestId: req?.id ? String(req.id).slice(0, 64) : null,
      }).catch(() => undefined);
      this.logger.error(`${req?.method} ${route} -> ${status}`, exception instanceof Error ? exception.stack : undefined);
    }

    if (exception instanceof HttpException) {
      res.status(exception.getStatus()).json(exception.getResponse());
      return;
    }
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ statusCode: 500, message: 'Internal server error' });
  }
}
