import * as fs from 'fs';
import * as path from 'path';
import { ForbiddenException } from '@nestjs/common';
import { ClassifiedsController } from './classifieds.controller';
import { RoleContextException, RoleContextErrorCode } from '../role-context/role-context.exception';

/**
 * Session-revocation follow-up (post Stage 2A Classified activation).
 *
 * resolveClassifiedActorId() used to catch EVERY exception from
 * sellerScope.resolve() -- including RoleContextException, which
 * SellerScopeService.resolve() throws via resolveContext() whenever the
 * caller's token carries a modern role-aware payload (sub/sid/rid/cv) whose
 * session is no longer authoritative (revoked, expired, version-mismatched,
 * organizationally revoked, role not active). Catching that and falling
 * back to plain user.id silently let a superseded token keep operating
 * every JwtAuthGuard-only Classified route that used the helper.
 *
 * The fix: only a genuinely legacy condition (no role-context payload on
 * the token at all, or a valid session with no team membership/permission
 * -- both surface as ForbiddenException, never RoleContextException) may
 * fall back to the caller's own id. Any RoleContextException must
 * propagate unchanged and fail the request closed.
 */
describe('ClassifiedsController — session-revocation fail-closed behavior', () => {
  const buildController = (resolveImpl: () => Promise<number>) => {
    const service: any = {
      findMine: jest.fn().mockResolvedValue(['ok']),
      getSellerInvoiceRequests: jest.fn().mockResolvedValue(['ok']),
      setShippingMethod: jest.fn().mockResolvedValue('ok'),
      markAsSold: jest.fn().mockResolvedValue('ok'),
      createManualInvoice: jest.fn().mockResolvedValue('ok'),
      createInvoiceForRequest: jest.fn().mockResolvedValue('ok'),
      findAll: jest.fn().mockResolvedValue(['public']),
      findOne: jest.fn().mockResolvedValue({ id: 9 }),
    };
    const sellerScope: any = { resolve: jest.fn(resolveImpl) };
    const verification: any = { requireFeature: jest.fn().mockResolvedValue(undefined) };
    const noop: any = {};
    const controller = new ClassifiedsController(
      service, noop, noop, noop, noop, sellerScope, verification,
    );
    return { controller, service, sellerScope, verification };
  };

  const REVOCATION_CODES: RoleContextErrorCode[] = [
    'ROLE_CONTEXT_REVOKED',
    'ROLE_CONTEXT_EXPIRED',
    'ROLE_NOT_ACTIVE',
    'ROLE_CONTEXT_VERSION_MISMATCH',
    'ROLE_CONTEXT_ORGANIZATIONAL_REVOKED',
    'ROLE_CONTEXT_MISSING',
  ];

  // Every JwtAuthGuard-only route that resolves its actor via
  // resolveClassifiedActorId() (i.e. NOT already gated by RoleContextGuard,
  // which would reject a revoked session before the controller body runs
  // at all). create()/update()/remove() are RoleContextGuard-protected and
  // are intentionally excluded here -- covered by role-context.guard's own
  // tests instead.
  const HELPER_DEPENDENT_ROUTES: Array<{
    name: string;
    call: (controller: any, req: any) => Promise<any>;
  }> = [
    { name: 'GET user/mine', call: (c, req) => c.findMine(req) },
    { name: 'GET invoices/seller-requests', call: (c, req) => c.getSellerInvoiceRequests(req) },
    { name: 'PATCH invoices/:requestId/shipping', call: (c, req) => c.setShipping(1, { shippingMethod: 'courier' }, req) },
    { name: 'PATCH :id/sold', call: (c, req) => c.markAsSold(1, req) },
    { name: 'POST invoices/manual', call: (c, req) => c.createManualInvoice(req, { buyerName: 'x', buyerPhone: 'x', productName: 'x', amount: 1 }) },
    { name: 'POST invoices/:requestId/create', call: (c, req) => c.createInvoiceForRequest(1, req, { amount: 1, invoiceDescription: 'x' }) },
  ];

  describe.each(REVOCATION_CODES)('authoritative failure: %s', (code) => {
    it.each(HELPER_DEPENDENT_ROUTES)('$name fails closed (propagates, never falls back to user.id)', async ({ call }) => {
      const { controller } = buildController(() => Promise.reject(new RoleContextException(code)));
      const req = { user: { id: 2 } };
      await expect(call(controller, req)).rejects.toBeInstanceOf(RoleContextException);
      await expect(call(controller, req)).rejects.toMatchObject({ response: { code } });
    });
  });

  describe('legitimate legacy fallback is preserved', () => {
    it.each(HELPER_DEPENDENT_ROUTES)('$name still succeeds via user.id when resolve() throws a non-RoleContext ForbiddenException (no team membership)', async ({ call }) => {
      const { controller, service } = buildController(() => Promise.reject(new ForbiddenException('no membership')));
      const req = { user: { id: 2 } };
      await expect(call(controller, req)).resolves.toBeDefined();
    });

    it('a valid, non-revoked resolution is used as-is (normal seller path)', async () => {
      const { controller, service } = buildController(() => Promise.resolve(2));
      const req = { user: { id: 2 } };
      await controller.findMine(req);
      expect(service.findMine).toHaveBeenCalledWith({ id: 2 }, undefined);
    });
  });

  describe('public discovery is structurally unaffected', () => {
    it('findAll() and findOne() never call resolveClassifiedActorId / sellerScope.resolve at all', async () => {
      const { controller, sellerScope } = buildController(() => Promise.resolve(2));
      await controller.findAll(undefined, undefined, {});
      await controller.findOne(9);
      expect(sellerScope.resolve).not.toHaveBeenCalled();
    });
  });

  describe('structural proof against regression', () => {
    const SOURCE = fs.readFileSync(path.join(__dirname, 'classifieds.controller.ts'), 'utf8');

    it('resolveClassifiedActorId rethrows RoleContextException instead of swallowing every error', () => {
      const helperBody = SOURCE.slice(SOURCE.indexOf('private async resolveClassifiedActorId'));
      expect(helperBody).toMatch(/if \(err instanceof RoleContextException\) throw err;/);
      // A bare `catch {` (no binding, swallow-everything) must not remain.
      const catchAll = /catch\s*\{\s*return user\.id;/;
      expect(helperBody).not.toMatch(catchAll);
    });
  });
});
