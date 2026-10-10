import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { compareScheduledJobs } from './scheduled-jobs.check';

// KNOWN_FAULTS.md #10: every ScheduleModule.forRoot() runs every @Cron job
// once more. There must be exactly one, in AppModule.
const SRC = join(__dirname, '..');
const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return name.endsWith('.ts') && !name.endsWith('.spec.ts') ? [full] : [];
  });

describe('scheduler set-up', () => {
  it('ScheduleModule.forRoot() is called exactly once, in app.module.ts', () => {
    const calls = sourceFiles(SRC).flatMap((file) => {
      const code = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')   // ignore block comments
        .replace(/\/\/.*$/gm, '');           // ignore line comments
      const count = (code.match(/ScheduleModule\s*\.\s*forRoot(Async)?\s*\(/g) ?? []).length;
      return Array(count).fill(relative(SRC, file).replace(/\\/g, '/'));
    });
    expect(calls).toEqual(['app.module.ts']);
  });
});

describe('start-up check of timed jobs', () => {
  it('passes when every job is registered once', () => {
    const r = compareScheduledJobs(['B.second', 'A.first'], 2);
    expect(r.ok).toBe(true);
    expect(r.message).toBe('Timed jobs: 2 registered, each once: A.first, B.second');
  });

  it('fails loudly when jobs are registered three times', () => {
    const r = compareScheduledJobs(['A.first', 'B.second'], 6, 3);
    expect(r.ok).toBe(false);
    expect(r.message).toContain('registered 6 times for 2 job(s)');
  });

  it('fails when a job is missing', () => {
    expect(compareScheduledJobs(['A.first', 'B.second'], 1).ok).toBe(false);
  });

  it('fails when there is more than one scheduler set-up, even if one registry looks fine', () => {
    const r = compareScheduledJobs(['A.first', 'B.second'], 2, 3);
    expect(r.ok).toBe(false);
    expect(r.message).toContain('by 3 scheduler set-up(s)');
  });
});
