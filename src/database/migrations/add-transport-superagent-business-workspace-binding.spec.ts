import 'reflect-metadata';
import { readdirSync } from 'fs';
import { getMetadataArgsStorage } from 'typeorm';
import { TransportProvider } from '../../transport/entities/transport-provider.entity';
import { SuperAgent } from '../../super-agents/entities/super-agent.entity';
import { Parcel } from '../../super-agents/entities/parcel.entity';
import { Business } from '../../business/entities/business.entity';
import { OperationalWorkspace } from '../../business/entities/operational-workspace.entity';
import { AddTransportSuperAgentBusinessWorkspaceBinding1788262800000 } from './1788262800000-AddTransportSuperAgentBusinessWorkspaceBinding';

describe('AddTransportSuperAgentBusinessWorkspaceBinding1788262800000', () => {
  const run = async (direction: 'up' | 'down') => {
    const sql: string[] = [];
    const queryRunner = {
      query: jest.fn(async (statement: string) => {
        sql.push(statement.replace(/\s+/g, ' ').trim());
      }),
    } as any;
    const migration = new AddTransportSuperAgentBusinessWorkspaceBinding1788262800000();
    await migration[direction](queryRunner);
    return sql;
  };

  it('UP adds only nullable businessId/workspaceId columns, SET NULL FKs, and the four partial unique indexes -- no data mutation', async () => {
    const sql = await run('up');
    const joined = sql.join(' ');

    expect(joined).toContain('ALTER TABLE public.transport_provider ADD COLUMN "businessId" integer');
    expect(joined).toContain(
      'FOREIGN KEY ("businessId") REFERENCES public.business(id) ON DELETE SET NULL',
    );
    expect(joined).toContain('ALTER TABLE public.super_agent ADD COLUMN "workspaceId" integer');
    expect(joined).toContain(
      'FOREIGN KEY ("workspaceId") REFERENCES public.operational_workspace(id) ON DELETE SET NULL',
    );

    expect(joined).toContain(
      'CREATE UNIQUE INDEX "UQ_transport_provider_business" ON public.transport_provider ("businessId") WHERE "businessId" IS NOT NULL',
    );
    expect(joined).toContain(
      'CREATE UNIQUE INDEX "UQ_transport_provider_unbound_user" ON public.transport_provider ("userId") WHERE "businessId" IS NULL',
    );
    expect(joined).toContain(
      'CREATE UNIQUE INDEX "UQ_super_agent_workspace" ON public.super_agent ("workspaceId") WHERE "workspaceId" IS NOT NULL',
    );
    expect(joined).toContain(
      'CREATE UNIQUE INDEX "UQ_super_agent_unbound_user" ON public.super_agent ("userId") WHERE "workspaceId" IS NULL',
    );

    // The two new columns must be nullable (no column-level NOT NULL) --
    // "IS NOT NULL" legitimately appears in the partial-index WHERE clauses
    // above, which is a different thing entirely.
    expect(joined).not.toMatch(/"businessId" integer NOT NULL/i);
    expect(joined).not.toMatch(/"workspaceId" integer NOT NULL/i);
    expect(joined).not.toMatch(/\bUPDATE\s|\bINSERT\s+INTO|\bDELETE\s+FROM|\bDROP\s+TABLE/i);
  });

  it('DOWN removes only the B5A indexes, FKs, and columns -- reverse order, no data mutation', async () => {
    const sql = await run('down');
    const joined = sql.join(' ');

    expect(joined).toContain('DROP INDEX IF EXISTS "UQ_super_agent_unbound_user"');
    expect(joined).toContain('DROP INDEX IF EXISTS "UQ_super_agent_workspace"');
    expect(joined).toContain('DROP CONSTRAINT "FK_super_agent_workspace"');
    expect(joined).toContain('ALTER TABLE public.super_agent DROP COLUMN "workspaceId"');

    expect(joined).toContain('DROP INDEX IF EXISTS "UQ_transport_provider_unbound_user"');
    expect(joined).toContain('DROP INDEX IF EXISTS "UQ_transport_provider_business"');
    expect(joined).toContain('DROP CONSTRAINT "FK_transport_provider_business"');
    expect(joined).toContain('ALTER TABLE public.transport_provider DROP COLUMN "businessId"');

    expect(joined).not.toMatch(/\bUPDATE\s|\bINSERT\s+INTO|\bDELETE\s+FROM|\bDROP\s+TABLE/i);
  });

  it('TransportProvider exposes a nullable businessId scalar and a SET NULL Business relation', () => {
    const storage = getMetadataArgsStorage();
    const columns = storage.columns.filter(({ target }) => target === TransportProvider);
    const column = (name: string) => columns.find(({ propertyName }) => propertyName === name);

    expect(column('businessId')?.options.nullable).toBe(true);
    // userId/name/type/registrationNumber/etc. all remain untouched (still nullable-as-before/required-as-before).
    expect(column('userId')?.options.nullable).toBe(true);
    expect(column('name')).toBeDefined();
    expect(column('registrationNumber')).toBeDefined();

    const relations = storage.relations.filter(({ target }) => target === TransportProvider);
    const businessRelation = relations.find(({ propertyName }) => propertyName === 'business');
    expect(businessRelation?.options).toMatchObject({ nullable: true, onDelete: 'SET NULL' });
    expect(businessRelation?.type()).toBe(Business);
  });

  it('SuperAgent exposes a nullable workspaceId scalar and a SET NULL OperationalWorkspace relation -- never a businessId field', () => {
    const storage = getMetadataArgsStorage();
    const columns = storage.columns.filter(({ target }) => target === SuperAgent);
    const column = (name: string) => columns.find(({ propertyName }) => propertyName === name);

    expect(column('workspaceId')?.options.nullable).toBe(true);
    expect(column('businessId')).toBeUndefined(); // deliberately absent per the B5.0 contract
    // Legacy profile fields remain untouched.
    expect(column('businessName')).toBeDefined();
    expect(column('city')).toBeDefined();
    expect(column('address')).toBeDefined();
    expect(column('userId')).toBeDefined();

    const relations = storage.relations.filter(({ target }) => target === SuperAgent);
    const workspaceRelation = relations.find(({ propertyName }) => propertyName === 'workspace');
    expect(workspaceRelation?.options).toMatchObject({ nullable: true, onDelete: 'SET NULL' });
    expect(workspaceRelation?.type()).toBe(OperationalWorkspace);
    // The existing user relation is unaffected (still required, still CASCADE).
    const userRelation = relations.find(({ propertyName }) => propertyName === 'user');
    expect(userRelation?.options).toMatchObject({ onDelete: 'CASCADE' });
  });

  it('Parcel.superAgent/destinationSuperAgent still point at SuperAgent unchanged -- B5A never touches Parcel schema (mission §11)', () => {
    const storage = getMetadataArgsStorage();
    const relations = storage.relations.filter(({ target }) => target === Parcel);
    const origin = relations.find(({ propertyName }) => propertyName === 'superAgent');
    const destination = relations.find(({ propertyName }) => propertyName === 'destinationSuperAgent');

    expect(origin?.type()).toBe(SuperAgent);
    expect(origin?.options).toMatchObject({ nullable: true, onDelete: 'SET NULL' });
    expect(destination?.type()).toBe(SuperAgent);
    expect(destination?.options).toMatchObject({ nullable: true, onDelete: 'SET NULL' });
  });

  it('raises the repository migration implementation count to 11', () => {
    const migrations = readdirSync(__dirname).filter((name) =>
      /^\d{13}-.+\.ts$/.test(name),
    );
    expect(migrations).toHaveLength(11);
  });
});
