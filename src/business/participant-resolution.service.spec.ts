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
      const participant = await service.ensureAccountRoleParticipant(5, 10, ParticipantKind.SELLER);
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
      const participant = await service.ensureAccountRoleParticipant(5, 10, ParticipantKind.SELLER);
      expect(participant.id).toBe(42);
      expect(participantRepo.save).not.toHaveBeenCalled();
    });

    it('reactivates a previously-LEFT participant rather than creating a duplicate', async () => {
      const { service, participantRepo } = build();
      const existing = { id: 42, conversationId: 5, accountRoleId: 10, status: ParticipantStatus.LEFT };
      participantRepo.findOne.mockResolvedValue(existing);
      const participant = await service.ensureAccountRoleParticipant(5, 10, ParticipantKind.SELLER);
      expect(participantRepo.update).toHaveBeenCalledWith(42, expect.objectContaining({ status: ParticipantStatus.ACTIVE }));
      expect(participant.status).toBe(ParticipantStatus.ACTIVE);
    });
  });

  describe('ensureExternalContactParticipant', () => {
    it('creates a participant shaped to satisfy CHK_conv_participant_one_principal -- externalCustomerId set, every other principal field left unset', async () => {
      const { service, participantRepo } = build();
      participantRepo.findOne.mockResolvedValue(null);
      const participant = await service.ensureExternalContactParticipant(4, 9);
      expect(participantRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: 4,
          principalType: ParticipantPrincipalType.EXTERNAL_CONTACT,
          externalCustomerId: 9,
          status: ParticipantStatus.ACTIVE,
        }),
      );
      const created = participantRepo.create.mock.calls[0][0];
      expect(created.userId).toBeUndefined();
      expect(created.accountRoleId).toBeUndefined();
      expect(created.workspaceType).toBeUndefined();
      expect(created.workspaceId).toBeUndefined();
      expect(participant.externalCustomerId).toBe(9);
    });

    it('is idempotent -- a second call for the same conversation+externalCustomerId returns the existing row instead of duplicating', async () => {
      const { service, participantRepo } = build();
      const existing = { id: 77, conversationId: 4, externalCustomerId: 9, status: ParticipantStatus.ACTIVE };
      participantRepo.findOne.mockResolvedValue(existing);
      const participant = await service.ensureExternalContactParticipant(4, 9);
      expect(participant.id).toBe(77);
      expect(participantRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('manager-aware transaction support', () => {
    // ConversationClassifierService's per-conversation atomicity hardening
    // needs ensureAccountRoleParticipant/ensureExternalContactParticipant to
    // write through a transaction's EntityManager when one is supplied,
    // instead of the module-injected default repository -- otherwise a
    // "transactional" write would silently escape the transaction and
    // commit immediately regardless of what happens to the rest of the
    // conversation's mutations.
    const buildTxManager = () => {
      const txRepo: any = {
        findOne: jest.fn(),
        create: jest.fn((data: any) => data),
        save: jest.fn((data: any) => Promise.resolve({ id: 555, ...data })),
        update: jest.fn(),
      };
      const manager: any = { getRepository: jest.fn(() => txRepo) };
      return { manager, txRepo };
    };

    it('ensureAccountRoleParticipant, given a manager, writes through manager.getRepository(...) and never touches the default injected repo', async () => {
      const { service, participantRepo } = build();
      const { manager, txRepo } = buildTxManager();
      txRepo.findOne.mockResolvedValue(null);

      const participant = await service.ensureAccountRoleParticipant(5, 10, ParticipantKind.SELLER, {}, manager);

      expect(manager.getRepository).toHaveBeenCalled();
      expect(txRepo.findOne).toHaveBeenCalled();
      expect(txRepo.create).toHaveBeenCalled();
      expect(txRepo.save).toHaveBeenCalled();
      expect(participantRepo.findOne).not.toHaveBeenCalled();
      expect(participantRepo.create).not.toHaveBeenCalled();
      expect(participantRepo.save).not.toHaveBeenCalled();
      expect(participant.accountRoleId).toBe(10);
    });

    it('ensureAccountRoleParticipant, given a manager, reactivates an existing LEFT row through the transactional repo, not the default one', async () => {
      const { service, participantRepo } = build();
      const { manager, txRepo } = buildTxManager();
      const existing = { id: 42, conversationId: 5, accountRoleId: 10, status: ParticipantStatus.LEFT };
      txRepo.findOne.mockResolvedValue(existing);

      const participant = await service.ensureAccountRoleParticipant(5, 10, ParticipantKind.SELLER, {}, manager);

      expect(txRepo.update).toHaveBeenCalledWith(42, expect.objectContaining({ status: ParticipantStatus.ACTIVE }));
      expect(participantRepo.update).not.toHaveBeenCalled();
      expect(participant.status).toBe(ParticipantStatus.ACTIVE);
    });

    it('ensureExternalContactParticipant, given a manager, writes through manager.getRepository(...) and never touches the default injected repo', async () => {
      const { service, participantRepo } = build();
      const { manager, txRepo } = buildTxManager();
      txRepo.findOne.mockResolvedValue(null);

      const participant = await service.ensureExternalContactParticipant(4, 9, manager);

      expect(manager.getRepository).toHaveBeenCalled();
      expect(txRepo.create).toHaveBeenCalled();
      expect(txRepo.save).toHaveBeenCalled();
      expect(participantRepo.findOne).not.toHaveBeenCalled();
      expect(participantRepo.create).not.toHaveBeenCalled();
      expect(participantRepo.save).not.toHaveBeenCalled();
      expect(participant.externalCustomerId).toBe(9);
    });

    it('calls made WITHOUT a manager preserve the existing (pre-hardening) dual-write behavior exactly -- the default injected repo is used and no manager is ever referenced', async () => {
      const { service, participantRepo } = build();
      participantRepo.findOne.mockResolvedValue(null);

      await service.ensureAccountRoleParticipant(5, 10, ParticipantKind.SELLER);
      await service.ensureExternalContactParticipant(4, 9);

      expect(participantRepo.create).toHaveBeenCalledTimes(2);
      expect(participantRepo.save).toHaveBeenCalledTimes(2);
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
