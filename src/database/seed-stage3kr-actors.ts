import 'reflect-metadata';
import * as bcrypt from 'bcrypt';
import dataSource from './data-source';

/** Disposable identities for the isolated Stage 3K–3R rehearsal database. */
const actors = [
  { key: 'buyer', role: 'user', name: 'Stage3KR Buyer' },
  { key: 'origin-hub', role: 'super_agent', name: 'Stage3KR Kariakoo Hub' },
  { key: 'destination-hub', role: 'super_agent', name: 'Stage3KR Mbagala Hub' },
  { key: 'agent', role: 'agent', name: 'Stage3KR Delivery Agent' },
  { key: 'admin', role: 'admin', name: 'Stage3KR Admin' },
] as const;

export function assertStage3krSeedTarget(env: NodeJS.ProcessEnv): void {
  const smsDisabled = env.STAGE3KR_DISABLE_OUTBOUND_SMS === 'true';
  const controlledSms = env.STAGE3KR_DISABLE_OUTBOUND_SMS === 'false' &&
    env.STAGE3KR_SMS_REHEARSAL === 'true' &&
    /^\+255\d{9}$/.test(env.STAGE3KR_SMS_TEST_PHONE || '') &&
    !!env.AT_API_KEY && !!env.AT_USERNAME && env.AT_USERNAME !== 'sandbox';
  if (env.STAGE3KR_SEED_CONFIRM !== 'SEED_ISOLATED_STAGE3KR' ||
      env.DB_NAME !== 'kentexa_stage3kr' || env.DB_USERNAME !== 'kentexa_stage3kr' ||
      (!smsDisabled && !controlledSms) ||
      env.STAGE3KR_DISABLE_UPLOADS !== 'true' ||
      !env.STAGE3KR_TEST_PASSWORD || env.STAGE3KR_TEST_PASSWORD.length < 24) {
    throw new Error('Stage3KR seed refused: isolated target, disabled outbound integrations, and test password required');
  }
}

async function seed(): Promise<void> {
  assertStage3krSeedTarget(process.env);
  await dataSource.initialize();
  try {
    const hash = await bcrypt.hash(process.env.STAGE3KR_TEST_PASSWORD!, 12);
    const testAvatar = 'https://stage3kr.kentexa.com/logo192.png';
    await dataSource.transaction(async manager => {
      for (const actor of actors) {
        const email = `stage3kr-${actor.key}@example.invalid`;
        const existing = await manager.query('SELECT id, name FROM public."user" WHERE email = $1', [email]);
        if (existing.length && existing[0].name !== actor.name)
          throw new Error(`Stage3KR seed refused: reserved email already belongs to another actor (${actor.key})`);
        const userId = existing.length ? existing[0].id : (await manager.query(
          `INSERT INTO public."user" (email, name, password, role, "isVerified", "avatarUrl", "onboardingCompleted")
           VALUES ($1, $2, $3, $4, true, $5, true) RETURNING id`,
          [email, actor.name, hash, actor.role, testAvatar],
        ))[0].id;
        // Only these reserved synthetic identities receive the test avatar.
        // Preserve an existing password and role on every pre-deploy retry.
        if (existing.length) await manager.query(
          `UPDATE public."user" SET "avatarUrl" = $2, "onboardingCompleted" = true
           WHERE id = $1 AND email = $3`, [userId, testAvatar, email],
        );
        await manager.query(
          `INSERT INTO public.account_role ("userId", "roleType", status, "profileType", "profileId")
           VALUES ($1, 'buyer', 'active', 'user', $1) ON CONFLICT DO NOTHING`, [userId],
        );
        if (actor.role === 'super_agent') {
          const hub = await manager.query(
            `INSERT INTO public.super_agent ("userId", "businessName", city, status)
             VALUES ($1, $2, 'Dar es Salaam', 'active')
             ON CONFLICT ("userId") WHERE "workspaceId" IS NULL DO NOTHING RETURNING id`, [userId, actor.name],
          );
          const hubId = hub[0]?.id ?? (await manager.query(
            'SELECT id FROM public.super_agent WHERE "userId" = $1 AND "workspaceId" IS NULL', [userId],
          ))[0].id;
          await manager.query(
            `INSERT INTO public.account_role ("userId", "roleType", status, "profileType", "profileId")
             VALUES ($1, 'super_agent', 'active', 'super_agent', $2) ON CONFLICT DO NOTHING`, [userId, hubId],
          );
        } else if (actor.role === 'agent') {
          const agent = await manager.query(
            `INSERT INTO public.agent ("userId", "fullName", city, status)
             SELECT $1, $2, 'Dar es Salaam', 'approved'
             WHERE NOT EXISTS (SELECT 1 FROM public.agent WHERE "userId" = $1) RETURNING id`, [userId, actor.name],
          );
          const agentId = agent[0]?.id ?? (await manager.query(
            'SELECT id FROM public.agent WHERE "userId" = $1', [userId],
          ))[0].id;
          await manager.query(
            `INSERT INTO public.account_role ("userId", "roleType", status, "profileType", "profileId")
             VALUES ($1, 'agent', 'active', 'agent', $2) ON CONFLICT DO NOTHING`, [userId, agentId],
          );
        } else if (actor.role === 'admin') {
          await manager.query(
            `INSERT INTO public.account_role ("userId", "roleType", status, "profileType", "profileId")
             VALUES ($1, 'admin', 'active', 'user', $1) ON CONFLICT DO NOTHING`, [userId],
          );
        }
      }
    });
    console.log('Stage3KR synthetic actors present: buyer, 2 hubs, agent, admin (no credentials printed).');
  } finally {
    await dataSource.destroy();
  }
}

if (require.main === module) seed().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
