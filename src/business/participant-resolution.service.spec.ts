import { ParticipantResolutionService } from './participant-resolution.service';
import { ParticipantKind, ParticipantPrincipalType, ParticipantStatus } from './entities/conversation-participant.entity';
import { AccountRoleType, RoleProfileType } from '../role-context/entities/account-role.entity';
import { RoleContext } from '../role-context/role-context.types';

const sellerRoleContext: RoleContext = {
  userId: 1, accountRoleId: 10, roleType: AccountRoleType.SELLER,
  profileType: RoleProfileType.SELLER_PROFILE, profileId: 77,
  capabilities: [], sessionId: 's1', contextVersion: 1,
};

const buyerRoleContext: RoleContext = {
  userId: 2, accountRoleId: 20, roleType: AccountRoleType.BUYER,
  profileType: RoleProfileType.USER, profileId: 2,
  capabilities: [], sessionId: 's2', contextVersion: 1,
};

describe('ParticipantResolutionService', () => {
  const build = () => {
    const participantRepo: any = {
      findOne: jest.fn(),
      create: jest.fn((data) => data),
      save: jest.fn((data) => Promise.resolve({ id: 100, ...data })),
      update: jest.fn(),
    };
    const stateRepo: any = {
      findOne: jest.fn(),
      create: jest.fn((data) => data),
      save: jest.fn((data) => Promise.resolve({ id: 200, ...data })),
      update: jest.fn(),
      increment: jest.fn(),
    };
    return { service: new ParticipantResolutionService(participantRepo, stateRepo), participantRepo, stateRepo };
  };

  describe('resolveWorkspace', () => {
    it('returns the RoleContext profile as the workspace for an operational role', () => {
      const { service } = build();
      expect(service.resolveWorkspace(sellerRoleContext)).toEqual({
        workspaceType: RoleProfileType.SELLER_PROFILE,
        workspaceId: 77,
      });
    });

    it('returns null for an account-level role (buyer shares the User identity profile)', () => {
      const { service } = build();
      expect(service.resolveWorkspace(buyerRoleContext)).toBeNull();
    });
  });

  describe('ensureAccountRoleParticipant', () => {
    it('creates a new participant with the resolved accountRoleId, never a client-supplied id', async () => {
      const { service, participantRepo } = build();
      participantRepo.findOne.mockResolvedValue(null);
      const participant = await service.ensureAccountRoleParticipant(5, sellerRoleContext, ParticipantKind.SELLER);
      expect(participantRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: 5,
          principalType: ParticipantPrincipalType.ACCOUNT_ROLE,
          accountRoleId: 10,
          participantKind: ParticipantKind.SELLER,
          status: ParticipantStatus.ACTIVE,
        }),
      );
      expect(participant.accountRoleId).toBe(10);
    });

    it('is idempotent -- a second call for the same conversation+accountRoleId returns the existing row instead of duplicating', async () => {
      const { service, participantRepo } = build();
      const existing = { id: 42, conversationId: 5, accountRoleId: 10, status: ParticipantStatus.ACTIVE };
      participantRepo.findOne.mockResolvedValue(existing);
      const participant = await service.ensureAccountRoleParticipant(5, sellerRoleContext, ParticipantKind.SELLER);
      expect(participant.id).toBe(42);
      expect(participantRepo.save).not.toHaveBeenCalled();
    });

    it('reactivates a previously-LEFT participant rather than creating a duplicate', async () => {
      const { service, participantRepo } = build();
      const existing = { id: 42, conversationId: 5, accountRoleId: 10, status: ParticipantStatus.LEFT };
      participantRepo.findOne.mockResolvedValue(existing);
      const participant = await service.ensureAccountRoleParticipant(5, sellerRoleContext, ParticipantKind.SELLER);
      expect(participantRepo.update).toHaveBeenCalledWith(42, expect.objectContaining({ status: ParticipantStatus.ACTIVE }));
      expect(participant.status).toBe(ParticipantStatus.ACTIVE);
    });
  });

  describe('isEntitled', () => {
    it('grants entitlement when an active account_role participant matches the resolved accountRoleId', async () => {
      const { service, participantRepo } = build();
      participantRepo.findOne.mockResolvedValueOnce({ id: 1 }); // account_role lookup hits
      await expect(service.isEntitled(5, sellerRoleContext)).resolves.toBe(true);
    });

    it('denies entitlement when neither the active role nor the account matches any participant', async () => {
      const { service, participantRepo } = build();
      participantRepo.findOne.mockResolvedValue(null); // both lookups miss
      await expect(service.isEntitled(5, sellerRoleContext)).resolves.toBe(false);
    });

    it('a transport-active context is not entitled to a conversation only a seller-role participant belongs to', async () => {
      const { service, participantRepo } = build();
      const transportRoleContext: RoleContext = {
        userId: 1, accountRoleId: 30, roleType: AccountRoleType.TRANSPORT_PROVIDER,
        profileType: RoleProfileType.TRANSPORT_PROVIDER, profileId: 5,
        capabilities: [], sessionId: 's3', contextVersion: 1,
      };
      participantRepo.findOne.mockResolvedValue(null); // no participant row for accountRoleId 30 or this userId
      await expect(service.isEntitled(5, transportRoleContext)).resolves.toBe(false);
    });
  });

  describe('markRead / incrementUnread', () => {
    it('resets unreadCount to 0 on markRead', async () => {
      const { service, stateRepo } = build();
      stateRepo.findOne.mockResolvedValue({ id: 200, conversationParticipantId: 42 });
      await service.markRead(42, 999);
      expect(stateRepo.update).toHaveBeenCalledWith(
        { conversationParticipantId: 42 },
        expect.objectContaining({ unreadCount: 0, lastReadMessageId: 999 }),
      );
    });
  });
});
