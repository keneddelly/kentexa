import { CommunicationFeatureFlagsService } from './communication-feature-flags.service';

/**
 * Stage 2B item 9: production must never be able to fall back to the known-
 * insecure "sub-only JWT auth + generic user:{userId} room" delivery, even
 * via a stray/misconfigured env var. ROLE_CONTEXT_SOCKET_AUTH/
 * ROLE_CONTEXT_SOCKET_ROOMS are production-locked to secure; every other
 * flag stays fully env-driven everywhere.
 */
describe('CommunicationFeatureFlagsService production-safe socket lock (Stage 2B item 9)', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('ignores COMM_FLAG_ROLE_CONTEXT_SOCKET_AUTH=false in production -- stays secure', () => {
    process.env.NODE_ENV = 'production';
    process.env.COMM_FLAG_ROLE_CONTEXT_SOCKET_AUTH = 'false';
    const service = new CommunicationFeatureFlagsService();
    expect(service.isEnabled('ROLE_CONTEXT_SOCKET_AUTH')).toBe(true);
  });

  it('ignores COMM_FLAG_ROLE_CONTEXT_SOCKET_ROOMS=false in production -- stays secure', () => {
    process.env.NODE_ENV = 'production';
    process.env.COMM_FLAG_ROLE_CONTEXT_SOCKET_ROOMS = 'false';
    const service = new CommunicationFeatureFlagsService();
    expect(service.isEnabled('ROLE_CONTEXT_SOCKET_ROOMS')).toBe(true);
  });

  it('honors the override outside production (development/test) -- rollback still works for real debugging', () => {
    process.env.NODE_ENV = 'development';
    process.env.COMM_FLAG_ROLE_CONTEXT_SOCKET_AUTH = 'false';
    const service = new CommunicationFeatureFlagsService();
    expect(service.isEnabled('ROLE_CONTEXT_SOCKET_AUTH')).toBe(false);
  });

  it('other (non-socket) flags remain fully env-driven in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.COMM_FLAG_SCOPED_CONVERSATION_READ = 'true';
    const service = new CommunicationFeatureFlagsService();
    expect(service.isEnabled('SCOPED_CONVERSATION_READ')).toBe(true);
  });

  it('production with no override at all still resolves the secure default', () => {
    process.env.NODE_ENV = 'production';
    const service = new CommunicationFeatureFlagsService();
    expect(service.isEnabled('ROLE_CONTEXT_SOCKET_AUTH')).toBe(true);
    expect(service.isEnabled('ROLE_CONTEXT_SOCKET_ROOMS')).toBe(true);
  });
});
