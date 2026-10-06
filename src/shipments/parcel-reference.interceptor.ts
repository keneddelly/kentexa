import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Observable, from } from 'rxjs';
import { switchMap, tap } from 'rxjs/operators';
import { resolveParcelTrackingNumber } from './customer-tracking';
import { projectShipmentForParcelSafely } from './shipment-projection';

/**
 * Applied to controllers whose routes look a parcel up by `:trackingNumber`
 * (logistics repair Gate 3). It does two things, once, for all of them:
 *
 *  BEFORE the handler: the number in the URL may be the customer's number
 *  (the Shipment's). It is replaced by the Parcel's own stored number, so
 *  every existing handler finds the parcel without knowing there were ever
 *  two numbers. See customer-tracking.ts.
 *
 *  AFTER a successful handler: the parcel's Shipment is re-projected from
 *  the parcel and custody truth (shipment-projection.ts). The handlers that
 *  move a parcel therefore never write Shipment.status themselves, and a new
 *  handler added to such a controller is covered without remembering to.
 *  Read-only routes are skipped; a projection problem never fails a request
 *  that already succeeded.
 */
@Injectable()
export class ParcelReferenceInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ParcelReferenceInterceptor.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const given = request?.params?.trackingNumber;
    if (typeof given !== 'string' || !given) return next.handle();

    const mutates = String(request.method || 'GET').toUpperCase() !== 'GET';
    return from(this.resolve(given)).pipe(
      switchMap((parcelNumber) => {
        request.params.trackingNumber = parcelNumber;
        return next.handle().pipe(
          tap({ next: () => { if (mutates) void this.project(parcelNumber); } }),
        );
      }),
    );
  }

  private async resolve(given: string): Promise<string> {
    try {
      return await resolveParcelTrackingNumber(this.dataSource.manager, given);
    } catch (error) {
      this.logger.warn(`Tracking number resolution failed: ${(error as Error)?.message ?? error}`);
      return given;
    }
  }

  private async project(parcelNumber: string): Promise<void> {
    try {
      const rows = await this.dataSource.query(
        `SELECT id FROM public.parcel WHERE "trackingNumber" = $1 AND "shipmentId" IS NOT NULL LIMIT 1`,
        [parcelNumber],
      );
      if (rows[0]) await projectShipmentForParcelSafely(this.dataSource.manager, Number(rows[0].id));
    } catch (error) {
      this.logger.warn(`Shipment projection failed: ${(error as Error)?.message ?? error}`);
    }
  }
}
