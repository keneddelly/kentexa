import { ConversationGateway } from './conversation.gateway';
import { RoleContextException } from '../role-context/role-context.exception';
import { AccountRoleType } from '../role-context/entities/account-role.entity';

/**
 * Stage 2 item 16/17/18: socket RoleContext authentication + scoped rooms +
 * disconnect-on-revocation. Mocks every dependency; asserts against the
 * mock Socket's own join/disconnect/leave calls and the mock Server's
 * room-targeted emit/disconnectSockets calls.
 */
describe('ConversationGateway (Stage 2 checkpoint H)', () => {
  const roleContext = {
    userId: 1, accountRoleId: 10, roleType: AccountRoleType.SELLER,
    profileType: 'seller_profile', profileId: 77, capabilities: [], sessionId: 'sess-1', contextVersion: 1,
  };

  const build = (flagOverrides: Record<string, boolean> = {}) => {
    const jwtService: any = { verify: jest.fn() };
    const sellerScope: any = { isAuthorizedFor: jest.fn() };
    const convoRepo: any = { findOne: jest.fn() };
    const roleContextService: any = { resolveContext: jest.fn() };
    const sessionEvents: any = { onRevoked: jest.fn() };
    const participants: any = { isEntitled: jest.fn() };
    const defaultsOn = new Set(['ROLE_CONTEXT_SOCKET_AUTH', 'ROLE_CONTEXT_SOCKET_ROOMS', 'LEGACY_COMMUNICATION_READ_FALLBACK']);
    const flags: any = { isEnabled: jest.fn((f: string) => (f in flagOverrides ? flagOverrides[f] : defaultsOn.has(f))) };

    const gateway = new ConversationGateway(
      jwtService, sellerScope, convoRepo, roleContextService, sessionEvents, participants, flags,
    );

    const roomServer = { emit: jest.fn(), disconnectSockets: jest.fn() };
    const server: any = { to: jest.fn(() => roomServer) };
    gateway.server = server;

    const client: any = {
      handshake: { auth: { token: 'tok' }, query: {} },
      data: {},
      join: jest.fn(),
      leave: jest.fn(),
      disconnect: jest.fn(),
    };

    return { gateway, jwtService, sellerScope, convoRepo, roleContextService, sessionEvents, participants, flags, server, roomServer, client };
  };

  describe('handleConnection', () => {
    it('disconnects immediately with no token', async () => {
      const { gateway, client } = build();
      client.handshake.auth = {};
      await gateway.handleConnection(client);
      expect(client.disconnect).toHaveBeenCalled();
    });

    it('disconnects a JWT missing sid/rid/cv (pre-role-context token)', async () => {
      const { gateway, jwtService, client } = build();
      jwtService.verify.mockReturnValue({ sub: 1 }); // no sid/rid/cv
      await gateway.handleConnection(client);
      expect(client.disconnect).toHaveBeenCalled();
    });

    it('disconnects when RoleContextService rejects the session (revoked/suspended/expired/version-mismatch)', async () => {
      const { gateway, jwtService, roleContextService, client } = build();
      jwtService.verify.mockReturnValue({ sub: 1, sid: 's1', rid: 10, rt: 'seller', cv: 1 });
      roleContextService.resolveContext.mockRejectedValue(new RoleContextException('ROLE_CONTEXT_REVOKED'));
      await gateway.handleConnection(client);
      expect(client.disconnect).toHaveBeenCalled();
      expect(client.join).not.toHaveBeenCalled();
    });

    it('joins account:{userId}, session:{sessionId}, and role:{accountRoleId} for a valid session', async () => {
      const { gateway, jwtService, roleContextService, client } = build();
      jwtService.verify.mockReturnValue({ sub: 1, sid: 'sess-1', rid: 10, rt: 'seller', cv: 1 });
      roleContextService.resolveContext.mockResolvedValue(roleContext);

      await gateway.handleConnection(client);

      expect(client.join).toHaveBeenCalledWith('account:1');
      expect(client.join).toHaveBeenCalledWith('session:sess-1');
      expect(client.join).toHaveBeenCalledWith('role:10');
      expect(client.disconnect).not.toHaveBeenCalled();
      expect(client.data.roleContext).toBe(roleContext);
    });

    it('never trusts a forged rt claim -- the joined room comes from the resolved AccountRole, not the JWT', async () => {
      const { gateway, jwtService, roleContextService, client } = build();
      // rt claims admin, but the DB-resolved context (mirroring
      // RoleContextService's own real behavior) says this session is
      // actually accountRoleId 10 (seller).
      jwtService.verify.mockReturnValue({ sub: 1, sid: 'sess-1', rid: 10, rt: 'admin', cv: 1 });
      roleContextService.resolveContext.mockResolvedValue(roleContext);

      await gateway.handleConnection(client);

      expect(client.join).toHaveBeenCalledWith('role:10');
      expect(client.join).not.toHaveBeenCalledWith(expect.stringMatching(/^role:(?!10$)/));
    });

    it('rollback path: ROLE_CONTEXT_SOCKET_AUTH disabled falls back to legacy sub-only auth', async () => {
      const { gateway, jwtService, roleContextService, client } = build({ ROLE_CONTEXT_SOCKET_AUTH: false });
      jwtService.verify.mockReturnValue({ sub: 1 });

      await gateway.handleConnection(client);

      expect(client.join).toHaveBeenCalledWith('user:1');
      expect(roleContextService.resolveContext).not.toHaveBeenCalled();
    });

    it('rollback path: ROLE_CONTEXT_SOCKET_ROOMS disabled still runs auth but joins the legacy user room instead of role:{id}', async () => {
      const { gateway, jwtService, roleContextService, client } = build({ ROLE_CONTEXT_SOCKET_ROOMS: false });
      jwtService.verify.mockReturnValue({ sub: 1, sid: 'sess-1', rid: 10, rt: 'seller', cv: 1 });
      roleContextService.resolveContext.mockResolvedValue(roleContext);

      await gateway.handleConnection(client);

      expect(client.join).toHaveBeenCalledWith('user:1');
      expect(client.join).not.toHaveBeenCalledWith('role:10');
      expect(roleContextService.resolveContext).toHaveBeenCalled(); // auth still ran
    });
  });

  describe('onModuleInit / session revocation disconnect', () => {
    it('disconnects the session:{sessionId} room on a single-session revocation', () => {
      const { gateway, sessionEvents, server, roomServer } = build();
      gateway.onModuleInit();
      const handler = sessionEvents.onRevoked.mock.calls[0][0];

      handler({ sessionId: 'sess-1', reason: 'logout' });

      expect(server.to).toHaveBeenCalledWith('session:sess-1');
      expect(roomServer.disconnectSockets).toHaveBeenCalledWith(true);
    });

    it('disconnects the role:{accountRoleId} room on a bulk (suspend) revocation', () => {
      const { gateway, sessionEvents, server, roomServer } = build();
      gateway.onModuleInit();
      const handler = sessionEvents.onRevoked.mock.calls[0][0];

      handler({ accountRoleId: 10, reason: 'role_status_synced_suspended' });

      expect(server.to).toHaveBeenCalledWith('role:10');
      expect(roomServer.disconnectSockets).toHaveBeenCalledWith(true);
    });
  });

  describe('joinConversation', () => {
    it('joins when ParticipantResolutionService.isEntitled resolves true', async () => {
      const { gateway, convoRepo, participants, client } = build();
      client.data = { userId: 1, roleContext };
      convoRepo.findOne.mockResolvedValue({ id: 5, sellerId: 1, customer: { userId: 2 } });
      participants.isEntitled.mockResolvedValue(true);

      await gateway.handleJoinConversation(client, 5 as any);

      expect(client.join).toHaveBeenCalledWith('conversation:5');
    });

    it('denies when neither the participant check nor the legacy fallback authorizes', async () => {
      const { gateway, convoRepo, participants, sellerScope, client } = build();
      client.data = { userId: 99, roleContext: { ...roleContext, userId: 99, roleType: AccountRoleType.BUYER } };
      convoRepo.findOne.mockResolvedValue({ id: 5, sellerId: 1, customer: { userId: 2 } }); // caller is neither seller nor the customer
      participants.isEntitled.mockResolvedValue(false);
      sellerScope.isAuthorizedFor.mockResolvedValue(false);

      await gateway.handleJoinConversation(client, 5 as any);

      expect(client.join).not.toHaveBeenCalledWith('conversation:5');
    });

    it('legacy fallback requires the ACTIVE role to match, not just the raw id (the actual Stage 2 fix for this path)', async () => {
      // Caller IS the conversation's seller by raw id, but is currently
      // active as buyer -- must NOT be granted seller-side join.
      const { gateway, convoRepo, participants, sellerScope, client } = build();
      client.data = { userId: 1, roleContext: { ...roleContext, roleType: AccountRoleType.BUYER } };
      convoRepo.findOne.mockResolvedValue({ id: 5, sellerId: 1, customer: { userId: 2 } });
      participants.isEntitled.mockResolvedValue(false);
      sellerScope.isAuthorizedFor.mockResolvedValue(true); // legacy raw-id check would have passed

      await gateway.handleJoinConversation(client, 5 as any);

      expect(client.join).not.toHaveBeenCalledWith('conversation:5');
    });
  });

  describe('emitNewMessage', () => {
    it('routes operational nudges to role:{accountRoleId} rooms, never a generic user:{} room, when rooms are enabled', () => {
      const { gateway, server, roomServer } = build();

      gateway.emitNewMessage({
        conversationId: 5, sellerId: 1, buyerUserId: 2,
        message: {} as any, isNote: false,
        sellerAccountRoleId: 10, buyerAccountRoleId: 20,
      });

      expect(server.to).toHaveBeenCalledWith('role:10');
      expect(server.to).toHaveBeenCalledWith('role:20');
      expect(server.to).not.toHaveBeenCalledWith('user:1');
      expect(server.to).not.toHaveBeenCalledWith('user:2');
      expect(roomServer.emit).toHaveBeenCalledWith('inboxUpdated', { conversationId: 5 });
    });

    it('skips a side\'s nudge (never falls back to a generic user room) when rooms are enabled but no accountRoleId was resolved', () => {
      const { gateway, server } = build();

      gateway.emitNewMessage({
        conversationId: 5, sellerId: 1, buyerUserId: 2,
        message: {} as any, isNote: false,
        // no sellerAccountRoleId/buyerAccountRoleId
      });

      expect(server.to).not.toHaveBeenCalledWith('user:1');
      expect(server.to).not.toHaveBeenCalledWith('user:2');
    });

    it('an internal note only reaches the seller room, never the buyer', () => {
      const { gateway, server } = build();

      gateway.emitNewMessage({
        conversationId: 5, sellerId: 1, buyerUserId: 2,
        message: {} as any, isNote: true,
        sellerAccountRoleId: 10, buyerAccountRoleId: 20,
      });

      expect(server.to).toHaveBeenCalledWith('role:10');
      expect(server.to).not.toHaveBeenCalledWith('role:20');
      expect(server.to).not.toHaveBeenCalledWith('conversation:5');
    });
  });
});
