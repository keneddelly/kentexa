import 'reflect-metadata';
import { SELF_DECLARED_DEPS_METADATA } from '@nestjs/common/constants';
import { getRepositoryToken } from '@nestjs/typeorm';
import { WalletModule } from './wallet.module';
import { WalletService } from './wallet.service';

/**
 * Regression guard for the exact production boot failure the original S0 correction fixed:
 * WalletService's constructor injected @InjectRepository(Order), but WalletModule's own
 * TypeOrmModule.forFeature([...]) never listed Order, so Nest's DI container threw
 * UnknownDependenciesException at real app startup.
 *
 * Every existing WalletService test constructs the service directly (`new WalletService(...)`)
 * with hand-built repository stubs, which can never catch a missing module registration — that
 * only manifests when Nest actually resolves the module's own provider graph. Fully
 * re-bootstrapping WalletModule through Nest's testing container would require replicating the
 * whole app's global modules and env-configured third-party clients — unrelated to this bug and
 * out of scope. Instead, this reads the same decorator metadata Nest itself reads at boot
 * (@InjectRepository's self-declared param tokens on WalletService, and the repository tokens
 * WalletModule's own TypeOrmModule.forFeature([...]) dynamic module actually provides) and
 * asserts every repository WalletService needs is one WalletModule supplies — no live database,
 * no Nest container instantiation required.
 *
 * S0 x I2G integration gate: WalletService no longer injects Order directly (its old
 * creditFromEscrowRelease backstop was removed — see wallet.service.ts's own comment on why;
 * the same PaymentEvidence check now lives inside OrderReleaseService, a WalletModule provider
 * that queries "order" via raw DataSource SQL, not a TypeORM repository). Order stays registered
 * in WalletModule's forFeature regardless (I2G integration invariant #7), checked explicitly below.
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
    expect(requiredRepoTokens.length).toBeGreaterThanOrEqual(3);
    expect(requiredRepoTokens).toEqual(
      expect.arrayContaining([
        getRepositoryToken(require('./entities/wallet.entity').Wallet),
        getRepositoryToken(require('./entities/wallet-transaction.entity').WalletTransaction),
        getRepositoryToken(require('../users/entities/user.entity').User),
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

  it('I2G integration invariant: Order stays registered in WalletModule regardless of whether WalletService itself currently needs it', () => {
    const moduleImports: any[] = Reflect.getMetadata('imports', WalletModule) || [];
    const registeredTokens = new Set<string>();
    for (const imp of moduleImports) {
      const providers = imp?.providers;
      if (!Array.isArray(providers)) continue;
      for (const provider of providers) {
        if (provider && typeof provider.provide === 'string') registeredTokens.add(provider.provide);
      }
    }
    expect(registeredTokens.has(getRepositoryToken(require('../orders/entities/order.entity').Order))).toBe(true);
  });
});
