import { ForbiddenException } from '@nestjs/common';
import { ProductsService } from './products.service';

/**
 * Business-First Stage 2A: Product workspace ownership. Covers new-write
 * stamping (from an already-resolved scope, never a fresh sellerId->
 * AccountRole lookup) and the fail-closed authorization matrix, gated
 * strictly on PRODUCT_WORKSPACE_DUAL_WRITE / PRODUCT_WORKSPACE_READ.
 */
describe('ProductsService — Business-First Stage 2A workspace ownership', () => {
  const buildService = (flagOverrides: Record<string, boolean> = {}) => {
    const savedProducts: any[] = [];
    const repo: any = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      remove: jest.fn().mockResolvedValue(undefined),
      create: jest.fn((data) => data),
      save: jest.fn().mockImplementation((p) => { savedProducts.push(p); return Promise.resolve(p); }),
    };
    const serialRepo: any = { find: jest.fn(), findOne: jest.fn(), exists: jest.fn().mockResolvedValue(false) };
    const commerceProfiles: any = { findById: jest.fn().mockResolvedValue(null), findForUserByType: jest.fn().mockResolvedValue(null) };
    const brandAuthorizations: any = { getBadgeStatus: jest.fn() };
    const brands: any = { findOne: jest.fn() };
    const searchIndex: any = { remove: jest.fn().mockResolvedValue(undefined), upsert: jest.fn().mockResolvedValue(undefined) };
    const feedService: any = { publish: jest.fn().mockResolvedValue(undefined) };
    const noop: any = {};
    const defaultsOn = new Set(['PRODUCT_WORKSPACE_DUAL_WRITE']); // matches production default
    const ownershipFlags: any = { isEnabled: jest.fn((f: string) => (f in flagOverrides ? flagOverrides[f] : defaultsOn.has(f))) };
    const service = new ProductsService(
      repo, noop, noop, noop, noop, noop, serialRepo, feedService, commerceProfiles, noop,
      searchIndex, noop, noop, { record: jest.fn() }, brandAuthorizations, brands,
      ownershipFlags,
    );
    return { service, repo, savedProducts, ownershipFlags };
  };

  describe('create() — new-write stamping', () => {
    it('stamps workspaceId from the resolved scope, not from any sellerId lookup, when dual-write is on', async () => {
      const { service, savedProducts } = buildService();
      const scope = { legacySellerId: 200, workspaceId: 7, mode: 'workspace' as const };
      await service.create({ name: 'Phone', basePrice: 1000 } as any, { id: 200 } as any, scope);
      expect(savedProducts[0].workspaceId).toBe(7);
    });

    it('VALID unresolved legacy Seller write: scope.workspaceId=null leaves Product.workspaceId null, write still succeeds', async () => {
      const { service, savedProducts } = buildService();
      const scope = { legacySellerId: 200, workspaceId: null, mode: 'legacy' as const };
      const saved = await service.create({ name: 'Phone', basePrice: 1000 } as any, { id: 200 } as any, scope);
      expect(saved).toBeDefined();
      expect(savedProducts[0].workspaceId).toBeNull();
    });

    it('no scope supplied at all (unmigrated call site) leaves workspaceId null, exactly like pre-Stage-2A behavior', async () => {
      const { service, savedProducts } = buildService();
      await service.create({ name: 'Phone', basePrice: 1000 } as any, { id: 200 } as any);
      expect(savedProducts[0].workspaceId).toBeNull();
    });

    it('PRODUCT_WORKSPACE_DUAL_WRITE off: never stamps workspaceId even when a resolved workspace scope is supplied', async () => {
      const { service, savedProducts } = buildService({ PRODUCT_WORKSPACE_DUAL_WRITE: false });
      const scope = { legacySellerId: 200, workspaceId: 7, mode: 'workspace' as const };
      await service.create({ name: 'Phone', basePrice: 1000 } as any, { id: 200 } as any, scope);
      expect(savedProducts[0].workspaceId).toBeNull();
    });
  });

  describe('update()/remove() — fail-closed authorization matrix (PRODUCT_WORKSPACE_READ on)', () => {
    const buildProduct = (workspaceId: number | null) => ({ id: 1, seller: { id: 200 }, commerceProfileId: null, workspaceId });

    it('caller W2 / resource W2 — ALLOW', async () => {
      const { service, repo } = buildService({ PRODUCT_WORKSPACE_READ: true });
      repo.findOne.mockResolvedValue(buildProduct(2));
      const scope = { legacySellerId: 999, workspaceId: 2, mode: 'workspace' as const }; // deliberately unrelated legacySellerId
      await expect(service.update(1, {} as any, { id: 999 } as any, false, scope)).resolves.toBeDefined();
    });

    it('caller W2 / resource W3 — DENY FINAL, no sellerId fallback even though sellerId would otherwise match', async () => {
      const { service, repo } = buildService({ PRODUCT_WORKSPACE_READ: true });
      repo.findOne.mockResolvedValue(buildProduct(3));
      // legacySellerId (200) DOES match product.seller.id (200) -- must still deny.
      const scope = { legacySellerId: 200, workspaceId: 2, mode: 'workspace' as const };
      await expect(service.update(1, {} as any, { id: 200 } as any, false, scope)).rejects.toThrow(ForbiddenException);
    });

    it('caller W2 / legacy resource NULL — sanctioned transitional fallback to seller.id', async () => {
      const { service, repo } = buildService({ PRODUCT_WORKSPACE_READ: true });
      repo.findOne.mockResolvedValue(buildProduct(null));
      const scope = { legacySellerId: 200, workspaceId: 2, mode: 'workspace' as const };
      await expect(service.update(1, {} as any, { id: 200 } as any, false, scope)).resolves.toBeDefined();
    });

    it('caller W2 / legacy resource NULL, wrong seller — fallback still denies correctly', async () => {
      const { service, repo } = buildService({ PRODUCT_WORKSPACE_READ: true });
      repo.findOne.mockResolvedValue(buildProduct(null));
      const scope = { legacySellerId: 999, workspaceId: 2, mode: 'workspace' as const };
      await expect(service.update(1, {} as any, { id: 999 } as any, false, scope)).rejects.toThrow(ForbiddenException);
    });

    it('valid unresolved legacy caller (workspaceId=null) — retains existing legacy seller.id behavior', async () => {
      const { service, repo } = buildService({ PRODUCT_WORKSPACE_READ: true });
      repo.findOne.mockResolvedValue(buildProduct(3)); // resource happens to have a workspace, irrelevant for a legacy caller
      const scope = { legacySellerId: 200, workspaceId: null, mode: 'legacy' as const };
      await expect(service.update(1, {} as any, { id: 200 } as any, false, scope)).resolves.toBeDefined();
    });

    it('PRODUCT_WORKSPACE_READ off — byte-identical to pre-Stage-2A behavior even with a resolved scope present', async () => {
      const { service, repo } = buildService({ PRODUCT_WORKSPACE_READ: false });
      repo.findOne.mockResolvedValue(buildProduct(3)); // mismatched workspace, would deny if the flag were on
      const scope = { legacySellerId: 200, workspaceId: 2, mode: 'workspace' as const };
      await expect(service.update(1, {} as any, { id: 200 } as any, false, scope)).resolves.toBeDefined();
    });

    it('admin override still bypasses ownership entirely, unaffected by workspace scope', async () => {
      const { service, repo } = buildService({ PRODUCT_WORKSPACE_READ: true });
      repo.findOne.mockResolvedValue(buildProduct(3));
      const scope = { legacySellerId: 999, workspaceId: 2, mode: 'workspace' as const };
      await expect(service.update(1, {} as any, { id: 999 } as any, true, scope)).resolves.toBeDefined();
    });

    it('remove(): caller W2 / resource W3 denies with no fallback, same as update()', async () => {
      const { service, repo } = buildService({ PRODUCT_WORKSPACE_READ: true });
      repo.findOne.mockResolvedValue(buildProduct(3));
      const scope = { legacySellerId: 200, workspaceId: 2, mode: 'workspace' as const };
      await expect(service.remove(1, { id: 200 } as any, false, scope)).rejects.toThrow(ForbiddenException);
    });
  });
});
