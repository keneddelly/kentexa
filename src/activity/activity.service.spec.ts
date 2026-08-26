import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ActivityService } from './activity.service';
import {
  ActivityEvent,
  ActivityCategory,
  ActorType,
} from './entities/activity-event.entity';

describe('ActivityService', () => {
  let service: ActivityService;
  let repo: {
    create: jest.Mock;
    save: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let qb: {
    select: jest.Mock;
    addSelect: jest.Mock;
    where: jest.Mock;
    andWhere: jest.Mock;
    groupBy: jest.Mock;
    orderBy: jest.Mock;
    limit: jest.Mock;
    getRawMany: jest.Mock;
    getRawOne: jest.Mock;
  };

  beforeEach(async () => {
    qb = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
      getRawOne: jest.fn().mockResolvedValue({ count: '0' }),
    };
    repo = {
      create: jest.fn((input) => input),
      save: jest.fn((input) => Promise.resolve({ id: 1, ...input })),
      createQueryBuilder: jest.fn(() => qb),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActivityService,
        { provide: getRepositoryToken(ActivityEvent), useValue: repo },
      ],
    }).compile();

    service = module.get<ActivityService>(ActivityService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('record', () => {
    it('persists an event with the fields provided', async () => {
      const input = {
        eventType: 'order.placed',
        eventCategory: ActivityCategory.COMMERCE,
        actorId: 5,
        actorType: ActorType.USER,
        businessId: 9,
        source: 'orders',
        metadata: { amount: 1000 },
      };

      const result = await service.record(input);

      expect(repo.create).toHaveBeenCalledWith(input);
      expect(repo.save).toHaveBeenCalled();
      expect(result).toMatchObject(input);
    });

    it('leaves severity/visibility to the entity column defaults when omitted', async () => {
      const input = {
        eventType: 'user.registered',
        eventCategory: ActivityCategory.AUTH,
        source: 'auth',
      };

      await service.record(input);

      const created = repo.create.mock.calls[0][0];
      expect(created.severity).toBeUndefined();
      expect(created.visibility).toBeUndefined();
    });
  });

  describe('getBusinessSummary', () => {
    it('scopes every query to the given businessId and date range', async () => {
      const from = '2026-08-01';
      const to = '2026-08-08';

      await service.getBusinessSummary(42, { from, to });

      expect(repo.createQueryBuilder).toHaveBeenCalledWith('e');
      const businessIdCalls = qb.where.mock.calls.filter(
        ([, params]) => params?.businessId === 42,
      );
      expect(businessIdCalls.length).toBeGreaterThan(0);

      const rangeCalls = qb.andWhere.mock.calls.filter(([clause]) =>
        clause.includes('e.timestamp BETWEEN'),
      );
      expect(rangeCalls.length).toBeGreaterThan(0);
      const [, rangeParams] = rangeCalls[0];
      expect(rangeParams.from).toEqual(new Date(from));
      expect(rangeParams.to).toEqual(new Date(to));
    });

    it('defaults to a 7-day trailing window when no range is given', async () => {
      const before = Date.now();
      await service.getBusinessSummary(1, {});
      const [, rangeParams] = qb.andWhere.mock.calls.find(([clause]) =>
        clause.includes('e.timestamp BETWEEN'),
      );
      const spanMs = rangeParams.to.getTime() - rangeParams.from.getTime();
      expect(spanMs).toBeCloseTo(7 * 24 * 60 * 60 * 1000, -3);
      expect(rangeParams.to.getTime()).toBeGreaterThanOrEqual(before);
    });

    it('never filters by businessId in a way that could leak another business — always includes an explicit businessId param', async () => {
      await service.getBusinessSummary(7, {});
      for (const [clause, params] of qb.where.mock.calls) {
        if (clause.includes('businessId')) {
          expect(params.businessId).toBe(7);
        }
      }
    });
  });

  describe('getAdminDashboard', () => {
    it('does not scope by businessId (platform-wide)', async () => {
      await service.getAdminDashboard({});
      for (const [clause] of qb.where.mock.calls) {
        expect(clause).not.toContain('businessId');
      }
    });
  });
});
