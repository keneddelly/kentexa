import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { AddBusinessCapabilityApplication1788261600000 } from '../database/migrations/1788261600000-AddBusinessCapabilityApplication';
import { Business } from './entities/business.entity';
import { OperationalWorkspace } from './entities/operational-workspace.entity';
import { BusinessMembership } from './entities/business-membership.entity';
import { WorkspaceAssignment } from './entities/workspace-assignment.entity';
import { BusinessCapability } from './entities/business-capability.entity';
import { BusinessCapabilityApplication } from './entities/business-capability-application.entity';
import { SellerProfile } from '../seller/entities/seller-profile.entity';
import { TransportProvider } from '../transport/entities/transport-provider.entity';
import { SuperAgent } from '../super-agents/entities/super-agent.entity';
import { ServiceProvider } from '../service-providers/entities/service-provider.entity';
import { ServiceAd } from '../services/entities/service-ad.entity';
import { AccountRole } from '../role-context/entities/account-role.entity';
import { ActiveRoleSession } from '../role-context/entities/active-role-session.entity';
import { User } from '../users/entities/user.entity';

/**
 * Shared connection/safety harness for every B5B closure-mission
 * integration test against the dedicated, least-privileged local
 * kentexa_b5b_test database (role kentexa_b5b_test_user -- no CREATEDB,
 * no SUPERUSER, scoped to this one database only, set up once by hand via
 * pgAdmin). Centralized here so every closure spec file reuses the exact
 * same hard-coded allow-list and the exact same abort-before-destroy
 * gate, rather than each file re-implementing (and potentially getting
 * wrong) its own copy.
 *
 * This module never creates or drops the database itself -- that's a
 * one-time, human-run pgAdmin step, deliberately outside this codebase's
 * (and this role's) privilege. It never reads B5B_TEST_DB_PASSWORD's
 * value for any purpose other than passing it straight to the pg driver,
 * and never logs it.
 */

export const B5B_TEST_DB_NAME = 'kentexa_b5b_test';
export const B5B_TEST_DB_USER = 'kentexa_b5b_test_user';

/** Base entity set synchronized directly (mirrors every B2/B3/B5A spec's own BASE_ENTITIES) -- BusinessCapabilityApplication is deliberately excluded here since its own partial unique index only exists via the real migration below, not via synchronize. ServiceProvider/ServiceAd added in Stage B6B -- their own businessId columns/indexes are declared via @Index/@Column decorators directly on the entities (like TransportProvider/SuperAgent's own B5A additions), so synchronize:true creates them correctly without needing Migration 11's own SQL replayed here. */
export const B5B_BASE_ENTITIES = [
  Business, OperationalWorkspace, BusinessMembership, WorkspaceAssignment,
  BusinessCapability, AccountRole, ActiveRoleSession, SellerProfile,
  TransportProvider, SuperAgent, ServiceProvider, ServiceAd, User,
];

/** Full entity set for the real, synchronize:false DataSource the service under test actually uses. */
export const B5B_ALL_ENTITIES = [...B5B_BASE_ENTITIES, BusinessCapabilityApplication];

export interface B5BTestConnectionConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

/**
 * Returns null (never throws) when B5B_TEST_DB_PASSWORD isn't set in the
 * environment -- that means "not configured on this machine yet", never
 * a security event, so callers should treat it as "skip these tests",
 * not "fail loudly". The password is read once here and handed straight
 * to the pg driver; nothing in this module ever logs or interpolates it
 * into a query, an error message, or a connection-string log line.
 */
export function getB5BTestConnectionConfig(): B5BTestConnectionConfig | null {
  const password = process.env.B5B_TEST_DB_PASSWORD;
  if (!password) return null;
  return {
    host: process.env.B5B_TEST_DB_HOST || 'localhost',
    port: parseInt(process.env.B5B_TEST_DB_PORT || '5432', 10),
    user: B5B_TEST_DB_USER,
    password,
    database: B5B_TEST_DB_NAME,
  };
}

/**
 * Hard safety gate -- MUST run immediately before any destructive
 * statement against a B5B test connection (resetB5BTestSchema below is
 * the only caller; nothing else in this codebase should run a
 * schema-drop directly). Throws -- never silently skips or returns a
 * boolean a caller could ignore -- the moment the live session isn't
 * exactly the dedicated database/role, since a mismatch here means a
 * schema-nuking statement is one line away from running against the
 * wrong database (kentexa, postgres, a future Render/production
 * connection accidentally reused, or anything else unexpected). Only
 * ever logs the (non-secret) db/user identifiers themselves, never a
 * credential.
 */
export async function assertSafeB5BTestSession(client: Client): Promise<void> {
  const { rows } = await client.query(
    'SELECT current_database() AS db, current_user AS usr, session_user AS session_usr',
  );
  const db = rows[0]?.db;
  const usr = rows[0]?.usr;
  const sessionUsr = rows[0]?.session_usr;
  if (db !== B5B_TEST_DB_NAME || usr !== B5B_TEST_DB_USER || sessionUsr !== B5B_TEST_DB_USER) {
    throw new Error(
      `B5B SAFETY ABORT: refusing destructive operation -- expected database "${B5B_TEST_DB_NAME}" as user ` +
      `"${B5B_TEST_DB_USER}", got database "${db}" as user "${usr}" (session_user "${sessionUsr}"). This almost ` +
      `certainly means the connection is pointed at the wrong database (e.g. "kentexa" or "postgres") -- never proceeding.`,
    );
  }
}

/**
 * Ownership-safe reset, exactly as specified for this mission:
 *   DROP SCHEMA IF EXISTS public CASCADE;
 *   CREATE SCHEMA public AUTHORIZATION kentexa_b5b_test_user;
 * Gated by assertSafeB5BTestSession -- structurally impossible to call
 * this without the safety check running first, since it's not exported
 * separately.
 */
export async function resetB5BTestSchema(client: Client): Promise<void> {
  await assertSafeB5BTestSession(client);
  await client.query('DROP SCHEMA IF EXISTS public CASCADE');
  await client.query(`CREATE SCHEMA public AUTHORIZATION ${B5B_TEST_DB_USER}`);
}

/**
 * Builds the real schema inside the (already reset) dedicated database:
 * synchronize the base entity set, create the two production enum types
 * (matching the real migrations' own naming, never TypeORM's own
 * synchronize-generated names -- confirmed empirically back in Stage B1),
 * then run the real AddBusinessCapabilityApplication migration. This is
 * the exact bootstrap sequence every B2/B3/B5A spec already established,
 * just re-pointed at the shared fixed database instead of a per-file
 * throwaway one this role has no privilege to create.
 */
export async function bootstrapB5BTestSchema(config: B5BTestConnectionConfig): Promise<void> {
  const baseDataSource = new DataSource({
    type: 'postgres', host: config.host, port: config.port, username: config.user, password: config.password,
    database: config.database, synchronize: true, entities: B5B_BASE_ENTITIES,
  });
  await baseDataSource.initialize();
  // Stage B6B: 'service'/'service_provider' added to match Migration 11's
  // own ALTER TYPE ADD VALUE additions -- CREATE TYPE ... AS ENUM directly
  // with the final value set here, since this bootstrap always builds the
  // end-state schema fresh (never replays the production ALTER TYPE
  // history statement-by-statement).
  await baseDataSource.query(`CREATE TYPE business_capability_code_enum AS ENUM ('commerce', 'transport', 'cargo', 'super_agent', 'service')`);
  await baseDataSource.query(`CREATE TYPE role_profile_type_enum AS ENUM ('user', 'seller_profile', 'agent', 'super_agent', 'transport_provider', 'service_provider')`);

  const queryRunner = baseDataSource.createQueryRunner();
  await queryRunner.connect();
  await new AddBusinessCapabilityApplication1788261600000().up(queryRunner);
  await queryRunner.release();

  await baseDataSource.destroy();
}
