import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Observable, Subscription, from, map, switchMap } from 'rxjs';
import { AccountRoleType } from '../role-context/entities/account-role.entity';
import { runAsTrainingOffice, TrainingSmsPreview } from './training-mode';

/**
 * Global: a request from someone acting as a training office runs in training
 * mode (training-mode.ts). Any SMS it would send is recorded instead and
 * returned as `trainingSmsPreview` on an object response. Every other request
 * is untouched (one cached lookup per Super Agent request).
 */
@Injectable()
export class TrainingModeInterceptor implements NestInterceptor {
  private cache = new Map<number, { training: boolean; at: number }>();
  constructor(private readonly db: DataSource) {}

  async isTrainingOffice(officeId: number): Promise<boolean> {
    const hit = this.cache.get(officeId);
    if (hit && Date.now() - hit.at < 30_000) return hit.training;
    const rows: any[] = await this.db
      .query(`SELECT "isTrainingOffice" FROM public.super_agent WHERE id = $1`, [officeId])
      .catch(() => []);
    const training = rows?.[0]?.isTrainingOffice === true;
    this.cache.set(officeId, { training, at: Date.now() });
    return training;
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType() !== 'http') return next.handle();
    const role = context.switchToHttp().getRequest()?.roleContext;
    if (role?.roleType !== AccountRoleType.SUPER_AGENT || !Number.isSafeInteger(role?.profileId)) return next.handle();
    return from(this.isTrainingOffice(role.profileId)).pipe(
      switchMap((training) => (training ? inTrainingMode(next) : next.handle())),
    );
  }
}

/** Subscribe to the handler INSIDE the training store, so all its async work sees it. */
function inTrainingMode(next: CallHandler): Observable<any> {
  return new Observable<any>((subscriber) => {
    let sub: Subscription | undefined;
    runAsTrainingOffice((previews) => {
      sub = next.handle().pipe(map((body) => withPreview(body, previews))).subscribe(subscriber);
    });
    return () => sub?.unsubscribe();
  });
}

export function withPreview(body: any, previews: TrainingSmsPreview[]) {
  if (!previews.length || !body || typeof body !== 'object' || Array.isArray(body)) return body;
  return { ...body, trainingSmsPreview: [...previews] };
}
