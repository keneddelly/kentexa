import { ForbiddenException } from '@nestjs/common';
import { ClassifiedsService } from './classifieds.service';

/**
 * Business-First Stage 2A: Classified workspace ownership. Same coverage
 * as products.workspace-ownership.spec.ts, gated on its own INDEPENDENT
 * CLASSIFIED_WORKSPACE_DUAL_WRITE / CLASSIFIED_WORKSPACE_READ flags --
 * proves Classified's security behavior is equivalent to Product's without
 * being coupled to Product's own flags.
 */
describe('ClassifiedsService — Business-First Stage 2A workspace ownership', () => {
  const buildService = (flagOverrides: Record<string, boolean> = {}) => {
    const savedListings: any[] = [];
    const repo: any = {
      findOne: jest.fn(),
      create: jest.fn((data) => data),
      save: jest.fn().mockImplementation((l) => { savedListings.push(l); return Promise.resolve(l); }),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    const invoiceRequestRepo: any = { findOne: jest.fn() };
    const invoiceRepo: any = { findOne: jest.fn() };
    const commerceProfiles: any = { findById: jest.fn().mockResolvedValue(null), findForUserByType: jest.fn().mockResolvedValue(null) };
    const searchIndex: any = { upsert: jest.fn().mockResolvedValue(undefined), remove: jest.fn().mockResolvedValue(undefined) };
    const feedService: any = { publish: jest.fn().mockResolvedValue(undefined) };
    const noop: any = {};
    const defaultsOn = new Set(['CLASSIFIED_WORKSPACE_DUAL_WRITE']); // matches production default
    const ownershipFlags: any = { isEnabled: jest.fn((f: string) => (f in flagOverrides ? flagOverrides[f] : defaultsOn.has(f))) };
    const service = new ClassifiedsService(
      repo, invoiceRequestRepo, invoiceRepo, noop, noop, noop, feedService,
      commerceProfiles, noop, searchIndex, noop, noop, ownershipFlags,
    );
    return { service, repo, savedListings, ownershipFlags };
  };

  describe('create() — new-write stamping', () => {
    it('stamps workspaceId from the resolved scope, not from any sellerId lookup, when dual-write is on', async () => {
      const { service, savedListings } = buildService();
      const scope = { legacySellerId: 200, workspaceId: 7, mode: 'workspace' as const };
      await service.create({ title: 'Sofa', price: 50000 } as any, { id: 200 } as any, scope);
      expect(savedListings[0].workspaceId).toBe(7);
    });

    it('VALID unresolved legacy Seller write: scope.workspaceId=null leaves Classified.workspaceId null, write still succeeds', async () => {
      const { service, savedListings } = buildService();
      const scope = { legacySellerId: 200, workspaceId: null, mode: 'legacy' as const };
      const saved = await service.create({ title: 'Sofa', price: 50000 } as any, { id: 200 } as any, scope);
      expect(saved).toBeDefined();
      expect(savedListings[0].workspaceId).toBeNull();
    });

    it('no scope supplied at all (unmigrated call site) leaves workspaceId null, exactly like pre-Stage-2A behavior', async () => {
      const { service, savedListings } = buildService();
      await service.create({ title: 'Sofa', price: 50000 } as any, { id: 200 } as any);
      expect(savedListings[0].workspaceId).toBeNull();
    });

    it('CLASSIFIED_WORKSPACE_DUAL_WRITE off: never stamps workspaceId even when a resolved workspace scope is supplied', async () => {
      const { service, savedListings } = buildService({ CLASSIFIED_WORKSPACE_DUAL_WRITE: false });
      const scope = { legacySellerId: 200, workspaceId: 7, mode: 'workspace' as const };
      await service.create({ title: 'Sofa', price: 50000 } as any, { id: 200 } as any, scope);
      expect(savedListings[0].workspaceId).toBeNull();
    });
  });

  describe('update()/remove() — fail-closed authorization matrix (CLASSIFIED_WORKSPACE_READ on)', () => {
    const buildListing = (workspaceId: number | null) => ({ id: 1, seller: { id: 200 }, commerceProfileId: null, workspaceId });

    it('caller W2 / resource W2 — ALLOW', async () => {
      const { service, repo } = buildService({ CLASSIFIED_WORKSPACE_READ: true });
      repo.findOne.mockResolvedValue(buildListing(2));
      const scope = { legacySellerId: 999, workspaceId: 2, mode: 'workspace' as const };
      await expect(service.update(1, {} as any, { id: 999 } as any, false, scope)).resolves.toBeDefined();
    });

    it('caller W2 / resource W3 — DENY FINAL, no sellerId fallback even though sellerId would otherwise match', async () => {
      const { service, repo } = buildService({ CLASSIFIED_WORKSPACE_READ: true });
      repo.findOne.mockResolvedValue(buildListing(3));
      const scope = { legacySellerId: 200, workspaceId: 2, mode: 'workspace' as const };
      await expect(service.update(1, {} as any, { id: 200 } as any, false, scope)).rejects.toThrow(ForbiddenException);
    });

    it('caller W2 / legacy resource NULL — sanctioned transitional fallback to seller.id', async () => {
      const { service, repo } = buildService({ CLASSIFIED_WORKSPACE_READ: true });
      repo.findOne.mockResolvedValue(buildListing(null));
      const scope = { legacySellerId: 200, workspaceId: 2, mode: 'workspace' as const };
      await expect(service.update(1, {} as any, { id: 200 } as any, false, scope)).resolves.toBeDefined();
    });

    it('valid unresolved legacy caller (workspaceId=null) — retains existing legacy seller.id behavior', async () => {
      const { service, repo } = buildService({ CLASSIFIED_WORKSPACE_READ: true });
      repo.findOne.mockResolvedValue(buildListing(3));
      const scope = { legacySellerId: 200, workspaceId: null, mode: 'legacy' as const };
      await expect(service.update(1, {} as any, { id: 200 } as any, false, scope)).resolves.toBeDefined();
    });

    it('CLASSIFIED_WORKSPACE_READ off — byte-identical to pre-Stage-2A behavior even with a resolved scope present', async () => {
      const { service, repo } = buildService({ CLASSIFIED_WORKSPACE_READ: false });
      repo.findOne.mockResolvedValue(buildListing(3));
      const scope = { legacySellerId: 200, workspaceId: 2, mode: 'workspace' as const };
      await expect(service.update(1, {} as any, { id: 200 } as any, false, scope)).resolves.toBeDefined();
    });

    it('independent from PRODUCT_WORKSPACE_READ — Classified enforces its own flag only', async () => {
      const { service, repo, ownershipFlags } = buildService({ CLASSIFIED_WORKSPACE_READ: true });
      repo.findOne.mockResolvedValue(buildListing(3));
      const scope = { legacySellerId: 200, workspaceId: 2, mode: 'workspace' as const };
      await expect(service.update(1, {} as any, { id: 200 } as any, false, scope)).rejects.toThrow(ForbiddenException);
      expect(ownershipFlags.isEnabled).toHaveBeenCalledWith('CLASSIFIED_WORKSPACE_READ');
      expect(ownershipFlags.isEnabled).not.toHaveBeenCalledWith('PRODUCT_WORKSPACE_READ');
    });

    it('remove(): caller W2 / resource W3 denies with no fallback, same as update()', async () => {
      const { service, repo } = buildService({ CLASSIFIED_WORKSPACE_READ: true });
      repo.findOne.mockResolvedValue(buildListing(3));
      const scope = { legacySellerId: 200, workspaceId: 2, mode: 'workspace' as const };
      await expect(service.remove(1, { id: 200 } as any, false, scope)).rejects.toThrow(ForbiddenException);
    });
  });
});
