import * as fs from 'fs';
import * as path from 'path';

/**
 * Boundary: nothing except the canonical OrderReleaseService may WRITE escrow-released state
 * (escrowStatus 'released', fundsReleasedAt). Source scan so a future writer cannot be added silently.
 */
const SRC = path.resolve(__dirname, '..');
const ALLOWED = new Set(['money-routing/order-release.service.ts']);

const walk = (dir: string, out: string[] = []): string[] => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (p.endsWith('.ts') && !/\.(spec|integration)\.ts$/.test(p) && !p.includes(`${path.sep}migrations${path.sep}`) && !p.includes(`${path.sep}entities${path.sep}`) && !/i2g-release-harness/.test(p)) out.push(p);
  }
  return out;
};

describe('release-writer boundary', () => {
  it('only OrderReleaseService writes escrowStatus released / fundsReleasedAt', () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const rel = path.relative(SRC, file).split(path.sep).join('/');
      if (ALLOWED.has(rel)) continue;
      fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        const t = line.trim();
        if (t.startsWith('//') || t.startsWith('*')) return;
        // A query-builder/raw READ predicate (.where/.andWhere/.orWhere(...)) embeds a SQL
        // condition string like "o.escrowStatus = 'released'" -- lexically identical to a write,
        // but it is a filter, never a mutation. Skip lines whose escrowStatus/fundsReleasedAt
        // mention is inside such a call (e.g. an admin read-only dashboard aggregate).
        if (/\.\s*(where|andWhere|orWhere)\s*\(/.test(t)) return;
        const writesEscrow = /escrowStatus\s*[:=]\s*(?:EscrowStatus\.RELEASED|['"`]released['"`])/.test(t);
        const writesFunds = /fundsReleasedAt\s*[:=]\s*(?:new Date|Date\.now|now\(|sql)/i.test(t); // (null/reads/response mapping are not releases)
        const rawSql = /SET[^;]*"escrowStatus"\s*=\s*'released'/i.test(t);
        if (writesEscrow || writesFunds || rawSql) offenders.push(`${rel}:${i + 1}: ${t}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it('only OrderReleaseService calls MoneyRoutingService.creditSellerProceeds/creditSellerProceedsIn directly', () => {
    // The escrow-column scan above guards the STATE write; it does not (and
    // structurally cannot, as written) guard the lower-level money-movement
    // primitive itself. This is the gap SuperAgentsService.updateParcelStatus()
    // exploited: it called MoneyRoutingService.creditSellerProceeds() directly,
    // reaching a real wallet credit while leaving order.escrowStatus /
    // fundsReleasedAt permanently unsynchronized with it (S0/I2G Issue #12).
    const CALLER_ALLOWED = new Set(['money-routing/order-release.service.ts']);
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const rel = path.relative(SRC, file).split(path.sep).join('/');
      if (CALLER_ALLOWED.has(rel) || rel === 'money-routing/money-routing.service.ts') continue;
      fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        const t = line.trim();
        if (t.startsWith('//') || t.startsWith('*')) return;
        if (/\b(creditSellerProceeds|creditSellerProceedsIn)\s*\(/.test(t)) {
          offenders.push(`${rel}:${i + 1}: ${t}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it('INVARIANT: the canonical release has no bypass — routing is unconditional and no flag can skip it', () => {
    const svc = fs.readFileSync(path.join(SRC, 'money-routing/order-release.service.ts'), 'utf8');
    expect(svc).not.toMatch(/RELEASE_GUARD_ENFORCE/);
    expect(svc).not.toMatch(/flags\.isEnabled|ownershipFlag\(/);
    // the release-state UPDATE must be preceded by routing that returns early unless ROUTED
    const update = svc.indexOf('"fundsReleasedAt" = now()');
    const credit = svc.indexOf('creditSellerProceedsIn(');
    const routedGate = svc.indexOf('MoneyRoutingState.ROUTED');
    expect(credit).toBeGreaterThan(-1);
    expect(routedGate).toBeGreaterThan(credit);
    expect(update).toBeGreaterThan(routedGate);
    // the flag no longer exists anywhere in production code
    const stray = walk(SRC).filter((f) => /RELEASE_GUARD_ENFORCE/.test(fs.readFileSync(f, 'utf8')));
    expect(stray).toEqual([]);
  });
});
