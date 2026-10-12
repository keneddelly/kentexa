import { AsyncLocalStorage } from 'async_hooks';

/**
 * Training office SMS ("ofisi ya mafunzo"): no real SMS ever leaves a training
 * office. While a request runs for someone acting as a training office
 * (TrainingModeInterceptor), SmsService.sendSms() sends nothing and records
 * the text here instead; the interceptor returns it with the response as
 * `trainingSmsPreview`, and the website shows "SMS ingetumwa: ...".
 */
export interface TrainingSmsPreview { to: string; text: string }

const store = new AsyncLocalStorage<TrainingSmsPreview[]>();

/**
 * Run `fn` as a training office. `fn` receives the list that collects every
 * SMS recorded inside it (also from async work it starts).
 */
export function runAsTrainingOffice<T>(fn: (previews: TrainingSmsPreview[]) => T): T {
  const previews: TrainingSmsPreview[] = [];
  return store.run(previews, () => fn(previews));
}

/** Inside a training-office request? Then record the SMS and return true (handled, not sent). */
export function captureTrainingSms(to: string, text: string): boolean {
  const previews = store.getStore();
  if (!previews) return false;
  previews.push({ to, text });
  return true;
}
