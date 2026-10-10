/**
 * Start-up check: every @Cron job in the code is registered exactly ONCE.
 *
 * Calling ScheduleModule.forRoot() in more than one module made every timed
 * job run three times at the same moment (KNOWN_FAULTS.md #10). Each such
 * set-up is its own module instance with its OWN SchedulerRegistry, so one
 * injected registry cannot see the copies. This check therefore walks every
 * module instance in the application, counts the scheduler set-ups, adds up
 * the cron jobs every one of them registered, and compares that with the
 * @Cron methods found on loaded providers. It logs at start-up:
 *   "Timed jobs: 9 registered, each once: ..."                        (fine)
 *   "Timed jobs registered 27 times ... by 3 scheduler set-ups ..."   (ERROR)
 * It only reads; it never changes or stops a job.
 */
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, ModulesContainer } from '@nestjs/core';
import { ScheduleModule, SchedulerRegistry } from '@nestjs/schedule';

// What @nestjs/schedule's own @Cron decorator writes (schedule.constants.ts and
// enums/scheduler-type.enum.ts; the enum is not exported by the package).
const SCHEDULER_TYPE = 'SCHEDULER_TYPE';
const SCHEDULER_TYPE_CRON = 1;

export interface ScheduledJobsResult {
  ok: boolean;
  expected: string[];
  registered: number;
  schedulerSetups: number;
  message: string;
}

export function compareScheduledJobs(expected: string[], registered: number, schedulerSetups = 1): ScheduledJobsResult {
  const names = [...expected].sort();
  if (schedulerSetups === 1 && registered === names.length) {
    return { ok: true, expected: names, registered, schedulerSetups,
      message: `Timed jobs: ${registered} registered, each once: ${names.join(', ')}` };
  }
  return {
    ok: false, expected: names, registered, schedulerSetups,
    message: `Timed jobs registered ${registered} times for ${names.length} job(s) in the code, ` +
      `by ${schedulerSetups} scheduler set-up(s) -- some jobs would run more than once (or not at all). ` +
      `The scheduler must be set up only once, in AppModule. Jobs: ${names.join(', ')}`,
  };
}

@Injectable()
export class ScheduledJobsCheck implements OnApplicationBootstrap {
  private readonly logger = new Logger('ScheduledJobsCheck');
  lastResult: ScheduledJobsResult | null = null;

  constructor(
    private readonly discovery: DiscoveryService,
    private readonly scanner: MetadataScanner,
    private readonly modules: ModulesContainer,
  ) {}

  /** "Class.method" for every @Cron method on a loaded, static provider. */
  cronMethodsInCode(): string[] {
    const found = new Set<string>();
    for (const wrapper of this.discovery.getProviders()) {
      const instance: any = wrapper.instance;
      if (!instance || typeof instance !== 'object' || !wrapper.isDependencyTreeStatic()) continue;
      const proto = Object.getPrototypeOf(instance);
      for (const method of this.scanner.getAllMethodNames(proto)) {
        if (Reflect.getMetadata(SCHEDULER_TYPE, proto[method]) === SCHEDULER_TYPE_CRON) {
          found.add(`${instance.constructor?.name ?? 'Unknown'}.${method}`);
        }
      }
    }
    return [...found];
  }

  /** Every scheduler set-up (ScheduleModule instance) and the cron jobs it registered. */
  schedulerSetups(): { setups: number; registered: number } {
    let setups = 0; let registered = 0;
    for (const moduleRef of this.modules.values()) {
      if (moduleRef.metatype !== ScheduleModule) continue;
      setups++;
      const registry = moduleRef.providers.get(SchedulerRegistry)?.instance as SchedulerRegistry | undefined;
      registered += registry ? registry.getCronJobs().size : 0;
    }
    return { setups, registered };
  }

  onApplicationBootstrap(): void {
    try {
      const { setups, registered } = this.schedulerSetups();
      this.lastResult = compareScheduledJobs(this.cronMethodsInCode(), registered, setups);
      if (this.lastResult.ok) this.logger.log(this.lastResult.message);
      else this.logger.error(this.lastResult.message);
    } catch (error) {
      this.logger.warn(`Could not check timed jobs: ${(error as Error)?.message ?? error}`);
    }
  }
}
