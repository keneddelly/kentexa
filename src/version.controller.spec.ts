import { VersionController } from './version.controller';

describe('VersionController', () => {
  const saved = { ...process.env };
  afterEach(() => { process.env = { ...saved }; });

  it('reports the commit and branch Render deployed', () => {
    process.env.RENDER_GIT_COMMIT = 'abc1234';
    process.env.RENDER_GIT_BRANCH = 'worktree-service-provider-profiles';
    const body = new VersionController().getVersion();
    expect(body.commit).toBe('abc1234');
    expect(body.branch).toBe('worktree-service-provider-profiles');
    expect(body.service).toBe('kentexa-backend');
    expect(Number.isNaN(Date.parse(body.startedAt))).toBe(false);
  });

  it('reports null, never a guess, outside a Render deploy', () => {
    delete process.env.RENDER_GIT_COMMIT;
    delete process.env.RENDER_GIT_BRANCH;
    const body = new VersionController().getVersion();
    expect(body.commit).toBeNull();
    expect(body.branch).toBeNull();
  });
});
