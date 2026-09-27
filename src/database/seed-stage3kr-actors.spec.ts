import { assertStage3krSeedTarget } from './seed-stage3kr-actors';

const allowed = {
  STAGE3KR_SEED_CONFIRM: 'SEED_ISOLATED_STAGE3KR', DB_NAME: 'kentexa_stage3kr',
  DB_USERNAME: 'kentexa_stage3kr', STAGE3KR_DISABLE_OUTBOUND_SMS: 'true',
  STAGE3KR_DISABLE_UPLOADS: 'true', STAGE3KR_TEST_PASSWORD: 'long-test-only-password-12345678',
};

test('actor seed refuses any production target or enabled outbound integration', () => {
  expect(() => assertStage3krSeedTarget(allowed)).not.toThrow();
  for (const [key, value] of Object.entries({
    DB_NAME: 'kentexa', DB_USERNAME: 'kentexa', STAGE3KR_DISABLE_OUTBOUND_SMS: 'false',
    STAGE3KR_DISABLE_UPLOADS: 'false', STAGE3KR_TEST_PASSWORD: 'short',
  })) expect(() => assertStage3krSeedTarget({ ...allowed, [key]: value })).toThrow('refused');
});

test('actor seed permits only an isolated SMS rehearsal with one test number', () => {
  const rehearsal = { ...allowed, STAGE3KR_DISABLE_OUTBOUND_SMS: 'false',
    STAGE3KR_SMS_REHEARSAL: 'true', STAGE3KR_SMS_TEST_PHONE: '+255712000000',
    AT_API_KEY: 'test-key', AT_USERNAME: 'test-account' };
  expect(() => assertStage3krSeedTarget(rehearsal)).not.toThrow();
  expect(() => assertStage3krSeedTarget({ ...rehearsal, STAGE3KR_SMS_TEST_PHONE: '+255712000001, +255713000002' })).toThrow();
  expect(() => assertStage3krSeedTarget({ ...rehearsal, DB_NAME: 'kentexa' })).toThrow();
});
