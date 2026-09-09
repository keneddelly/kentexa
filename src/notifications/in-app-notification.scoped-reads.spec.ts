import { InAppNotificationService } from './in-app-notification.service';
import { AccountRoleType, RoleProfileType } from '../role-context/entities/account-role.entity';

/**
 * Stage 2B item 4/5: notification scoped reads must resolve the current
 * permitted audience server-side (never `notification.userId = currentUser`
 * alone for an operational row), and mark-one/mark-all must be scoped to
 * that same audience.
 */
describe('InAppNotificationService scoped reads (Stage 2B checkpoint 4/5)', () => {
  const sellerRoleContext = {
    userId: 1, accountRoleId: 10, roleType: AccountRoleType.SELLER,
    profileType: RoleProfileType.SELLER_PROFILE, profileId: 77, capabilities: [], sessionId: 's1', contextVersion: 1,
  };

  const mockQueryBuilder = (result: any) => {
    const calls: { method: string; args: any[] }[] = [];
    const qb: any = {};
    ['where', 'andWhere', 'orderBy', 'take', 'skip', 'update', 'set'].forEach((m) => {
      qb[m] = jest.fn((...args: any[]) => {
        calls.push({ method: m, args });
        return qb;
      });
    });
    qb.getManyAndCount = jest.fn().mockResolvedValue(result);
    qb.getCount = jest.fn().mockResolvedValue(result);
    qb.execute = jest.fn().mockResolvedValue(undefined);
    return { qb, calls };
  };

  const build = (flagOverride: boolean | null = null) => {
    const repo: any = { createQueryBuilder: jest.fn(), update: jest.fn(), count: jest.fn() };
    const accountRoleRepo: any = { findOne: jest.fn().mockResolvedValue(null) };
    const push: any = { sendToUser: jest.fn().mockResolvedValue(undefined) };
    const flags: any = { isEnabled: jest.fn(() => (flagOverride === null ? true : flagOverride)) };
    const service = new InAppNotificationService(repo, accountRoleRepo, push, flags);
    return { service, repo, accountRoleRepo, flags };
  };

  describe('getMyNotifications', () => {
    it('applies the audience WHERE clause when a roleContext is passed and the flag is on', async () => {
      const { service, repo } = build();
      const { qb, calls } = mockQueryBuilder([[], 0]);
      repo.createQueryBuilder.mockReturnValue(qb);

      await service.getMyNotifications(1, 1, 30, sellerRoleContext as any);

      const andWhereCall = calls.find((c) => c.method === 'andWhere');
      expect(andWhereCall).toBeDefined(); // the Brackets-wrapped audience condition
    });

    it('never applies audience scoping when no roleContext is passed -- byte-for-byte legacy behavior for every un-migrated caller', async () => {
      const { service, repo } = build();
      const { qb, calls } = mockQueryBuilder([[], 0]);
      repo.createQueryBuilder.mockReturnValue(qb);

      await service.getMyNotifications(1, 1, 30);

      expect(calls.find((c) => c.method === 'andWhere')).toBeUndefined();
    });

    it('never applies audience scoping when SCOPED_NOTIFICATION_READ is off, even with a roleContext', async () => {
      const { service, repo } = build(false);
      const { qb, calls } = mockQueryBuilder([[], 0]);
      repo.createQueryBuilder.mockReturnValue(qb);

      await service.getMyNotifications(1, 1, 30, sellerRoleContext as any);

      expect(calls.find((c) => c.method === 'andWhere')).toBeUndefined();
    });
  });

  describe('markAllRead / markAllReadById', () => {
    it('scopes the UPDATE query when a roleContext is passed', async () => {
      const { service, repo } = build();
      const { qb, calls } = mockQueryBuilder(undefined);
      repo.createQueryBuilder.mockReturnValue(qb);

      await service.markAllRead(1, sellerRoleContext as any);

      expect(repo.update).not.toHaveBeenCalled(); // must use the scoped query builder path, not the blanket repo.update
      expect(calls.some((c) => c.method === 'andWhere')).toBe(true);
    });

    it('falls back to the plain userId-wide update when no roleContext is passed (legacy, unchanged)', async () => {
      const { service, repo } = build();
      await service.markAllRead(1);
      expect(repo.update).toHaveBeenCalledWith(
        { userId: 1, isRead: false },
        expect.objectContaining({ isRead: true }),
      );
    });

    it('markAllReadById delegates straight through to the scoped markAllRead', async () => {
      const { service, repo } = build();
      const { qb } = mockQueryBuilder(undefined);
      repo.createQueryBuilder.mockReturnValue(qb);

      await service.markAllReadById(1, sellerRoleContext as any);

      expect(qb.execute).toHaveBeenCalled();
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('the scoped UPDATE WHERE clause references the real column "user_id", not the entity property "userId"', async () => {
      const { service, repo } = build();
      const { qb, calls } = mockQueryBuilder(undefined);
      repo.createQueryBuilder.mockReturnValue(qb);

      await service.markAllRead(1, sellerRoleContext as any);

      const whereCall = calls.find((c) => c.method === 'where');
      expect(whereCall?.args[0]).toContain('"user_id"');
      expect(whereCall?.args[0]).not.toContain('"userId"');
    });
  });

  describe('markRead (mark-one)', () => {
    it('scopes the single-notification update when a roleContext is passed', async () => {
      const { service, repo } = build();
      const { qb, calls } = mockQueryBuilder(undefined);
      repo.createQueryBuilder.mockReturnValue(qb);

      await service.markRead(1, 555, sellerRoleContext as any);

      expect(repo.update).not.toHaveBeenCalled();
      expect(calls.some((c) => c.method === 'andWhere')).toBe(true);
    });

    it('falls back to the plain id+userId update when no roleContext is passed', async () => {
      const { service, repo } = build();
      await service.markRead(1, 555);
      expect(repo.update).toHaveBeenCalledWith(
        { id: 555, userId: 1 },
        expect.objectContaining({ isRead: true }),
      );
    });

    // Notification.userId maps to the DB column user_id (explicit @Column
    // name override) -- the scoped update path's raw, unaliased WHERE
    // string previously referenced the bare entity property name "userId"
    // instead, which Postgres takes as a literal (quoted) column name and
    // fails with 42703 "column userId does not exist" every time this
    // scoped branch actually ran in production.
    it('the scoped update WHERE clause references the real column "user_id", not the entity property "userId"', async () => {
      const { service, repo } = build();
      const { qb, calls } = mockQueryBuilder(undefined);
      repo.createQueryBuilder.mockReturnValue(qb);

      await service.markRead(1, 555, sellerRoleContext as any);

      const whereCall = calls.find((c) => c.method === 'where');
      expect(whereCall?.args[0]).toContain('"user_id"');
      expect(whereCall?.args[0]).not.toContain('"userId"');
    });
  });

  describe('getUnreadCount', () => {
    it('uses the scoped query builder when a roleContext is passed', async () => {
      const { service, repo } = build();
      const { qb } = mockQueryBuilder(3);
      repo.createQueryBuilder.mockReturnValue(qb);

      const count = await service.getUnreadCount(1, sellerRoleContext as any);

      expect(count).toBe(3);
      expect(repo.count).not.toHaveBeenCalled();
    });

    it('uses the plain repo.count when no roleContext is passed', async () => {
      const { service, repo } = build();
      repo.count.mockResolvedValue(7);
      const count = await service.getUnreadCount(1);
      expect(count).toBe(7);
    });
  });
});
