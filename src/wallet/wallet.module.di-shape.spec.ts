import 'reflect-metadata';
import { SELF_DECLARED_DEPS_METADATA } from '@nestjs/common/constants';
import { getRepositoryToken } from '@nestjs/typeorm';
import { WalletModule } from './wallet.module';
import { WalletService } from './wallet.service';

/**
 * Regression guard for the exact production boot failure this commit fixes:
 * WalletService's constructor injects @InjectRepository(Order), but
 * WalletModule's own TypeOrmModule.forFeature([...]) never listed Order, so
 * Nest's DI container threw UnknownDependenciesException at real app startup.
 *
 * Every existing WalletService test constructs the service directly
 * (`new WalletService(...)`) with hand-built repository stubs, which can
 * never catch a missing module registration — that only manifests when Nest
 * actually resolves the module's own provider graph. Fully re-bootstrapping
 * WalletModule through Nest's testing container would require replicating
 * the whole app's global modules and env-configured third-party clients
 * (JWT secret, Cloudinary, etc.) that WalletModule transitively imports via
 * BusinessModule/IdentityModule — unrelated to this bug and out of scope for
 * a minimal correction. Instead, this reads the same decorator metadata
 * Nest itself reads at boot (@InjectRepository's self-declared param tokens
 * on WalletService, and the repository tokens WalletModule's own
 * TypeOrmModule.forFeature([...]) dynamic module actually provides) and
 * asserts every repository WalletService needs is one WalletModule supplies
 * — no live database, no Nest container instantiation required.
 */
describe('WalletModule DI shape', () => {
  it('registers every entity repository WalletService injects via @InjectRepository', () => {
    const selfDeclaredDeps: Array<{ index: number; param: unknown }> =
      Reflect.getMetadata(SELF_DECLARED_DEPS_METADATA, WalletService) || [];
    expect(selfDeclaredDeps.length).toBeGreaterThan(0);

    const requiredRepoTokens = selfDeclaredDeps
      .map((dep) => dep.param)
      .filter((token): token is string => typeof token === 'string' && token.endsWith('Repository'));
    // Sanity check that this test is actually exercising real @InjectRepository
    // tokens and not silently degenerating into a vacuous pass.
    expect(requiredRepoTokens.length).toBeGreaterThanOrEqual(4);
    expect(requiredRepoTokens).toEqual(
      expect.arrayContaining([
        getRepositoryToken(require('./entities/wallet.entity').Wallet),
        getRepositoryToken(require('./entities/wallet-transaction.entity').WalletTransaction),
        getRepositoryToken(require('../users/entities/user.entity').User),
        getRepositoryToken(require('../orders/entities/order.entity').Order),
      ]),
    );

    const moduleImports: any[] = Reflect.getMetadata('imports', WalletModule) || [];
    const registeredTokens = new Set<string>();
    for (const imp of moduleImports) {
      const providers = imp?.providers;
      if (!Array.isArray(providers)) continue;
      for (const provider of providers) {
        if (provider && typeof provider.provide === 'string') {
          registeredTokens.add(provider.provide);
        }
      }
    }

    for (const token of requiredRepoTokens) {
      expect(registeredTokens.has(token)).toBe(true);
    }
  });
});
