import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Canonical custodian identity (Stage 3K-3R prerequisite correction S1):
 *   local_agent.toCustodianId / fromCustodianId = the Agent PROFILE id;
 *   actorUserId = the authenticated User who acted.
 * This guard fails if any production writer or reader pairs a 'local_agent'
 * custodian with a User id again. It changes no data and reinterprets no
 * historical row (production holds none; see the Issue #60 review).
 */
describe('local_agent custodian identity is the Agent profile id everywhere (structural)', () => {
  const root = join(__dirname, '..');
  const walk = (dir: string, out: string[] = []) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full, out);
      else if (/\.ts$/.test(name) && !/\.spec\.ts$|\.integration\.ts$/.test(name)) out.push(full);
    }
    return out;
  };
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const files = walk(root).filter((f) => /'local_agent'/.test(readFileSync(f, 'utf8')));
  const service = strip(readFileSync(join(__dirname, 'super-agents.service.ts'), 'utf8'));

  it('finds the known writers (so the guard cannot silently scan nothing)', () => {
    expect(files.map((f) => f.slice(root.length + 1).replace(/\\/g, '/'))).toEqual(
      expect.arrayContaining(['super-agents/super-agents.service.ts', 'parcel-collections/parcel-collections.service.ts']));
    expect((service.match(/(to|from)CustodianType: 'local_agent'/g) || []).length).toBeGreaterThanOrEqual(3);
  });

  it('never pairs a local_agent custodian with a User id (writers)', () => {
    for (const f of files) {
      const src = strip(readFileSync(f, 'utf8'));
      expect(`${f}: ${/(to|from)CustodianType: 'local_agent',\s*(to|from)CustodianId: user\.id/.test(src)}`)
        .toBe(`${f}: false`);
    }
    expect(service).toMatch(/toCustodianType: 'local_agent', toCustodianId: agent\.id/);
    expect((service.match(/fromCustodianType: 'local_agent', fromCustodianId: agent\.id/g) || []).length).toBe(2);
  });

  it('operation keys of the Agent legs are keyed by the Agent profile, not the User', () => {
    expect(service).toMatch(/destination-agent-received:\$\{agent\.id\}/);
    expect((service.match(/recipient-agent-delivery:\$\{agent\.id\}/g) || []).length).toBe(2);
    expect(service).not.toMatch(/(destination-agent-received|recipient-agent-delivery):\$\{user\.id\}/);
  });

  it('the reader that gates recipient delivery compares the latest custody to the acting Agent PROFILE', () => {
    expect(service).toMatch(/latest\.toCustodianType !== 'local_agent' \|\| latest\.toCustodianId !== agentProfileId/);
    expect(service).not.toMatch(/latest\.toCustodianId !== user\.id/);
    // every caller passes the profile id it already resolved from the active role
    expect((service.match(/lockedAgentDeliveryParcel\(manager, trackingNumber, user, agent\.id/g) || []).length).toBe(3);
  });

  it('the user-scoped assignment/challenge fields are a DIFFERENT concept and intentionally unchanged', () => {
    expect(service).toMatch(/parcel\.localAgentId !== String\(user\.id\)/);
    expect(service).toMatch(/agentHandoffAgentUserId: agentUserId/);
  });
});
