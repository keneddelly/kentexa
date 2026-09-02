/* Test-only executable. Run only against an explicitly allowed disposable database. */
import 'reflect-metadata';
import { Controller, Get, Module, UseGuards } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerModule } from '@nestjs/throttler';
import * as bcrypt from 'bcrypt';
import { AuthController } from '../auth/auth.controller';
import { AuthService } from '../auth/auth.service';
import { JwtStrategy } from '../auth/jwt.strategy';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RoleContextGuard } from './role-context.guard';
import { CapabilityGuard } from './capability.guard';
import { RequireCapabilities } from './capabilities';
import { CurrentRoleContext } from './current-role-context.decorator';
import { User } from '../users/entities/user.entity';
import { SellerProfile } from '../seller/entities/seller-profile.entity';
import { AccountRole, AccountRoleStatus, AccountRoleType, RoleProfileType } from './entities/account-role.entity';
import { ActiveRoleSession } from './entities/active-role-session.entity';
import { RoleContextModule } from './role-context.module';
import { Agent } from '../agents/entities/agent.entity';
import { SuperAgent } from '../super-agents/entities/super-agent.entity';
import { TransportProvider } from '../transport/entities/transport-provider.entity';
import { RoleMigrationAudit } from './entities/role-migration-audit.entity';
import { SmsService } from '../sms/sms.service';
import { MailService } from '../mail/mail.service';
import { CommerceProfilesService } from '../commerce-profiles/commerce-profiles.service';
import { PolicyVersionService } from '../policies/policy-version.service';
import { VerificationService } from '../identity/verification.service';
import { ProfileService } from '../profile/profile.service';

@Controller('phaseb-fixture')
@UseGuards(JwtAuthGuard, RoleContextGuard, CapabilityGuard)
class CapabilityFixtureController {
  @Get('capability')
  @RequireCapabilities('test:allowed')
  capability(@CurrentRoleContext() context: any) { return { accountRoleId: context.accountRoleId }; }

  @Get('admin-capability')
  @RequireCapabilities('admin:all')
  adminCapability(@CurrentRoleContext() context: any) { return { accountRoleId: context.accountRoleId }; }
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: 'postgres', host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 5432),
      username: process.env.DB_USERNAME, password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      entities: [
        User, SellerProfile, Agent, SuperAgent, TransportProvider,
        AccountRole, ActiveRoleSession, RoleMigrationAudit,
      ],
      synchronize: false,
    }),
    TypeOrmModule.forFeature([User]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 3600000, limit: 1000 },
    ]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: '30m' },
      }),
    }),
    RoleContextModule,
  ],
  controllers: [AuthController, CapabilityFixtureController],
  providers: [
    AuthService,
    JwtStrategy,
    { provide: SmsService, useValue: {} },
    { provide: MailService, useValue: {} },
    { provide: CommerceProfilesService, useValue: {} },
    { provide: PolicyVersionService, useValue: {} },
    { provide: VerificationService, useValue: {} },
    { provide: ProfileService, useValue: {} },
  ],
})
class IntegrationModule {}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function decode(token: string) { return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')); }

async function request(base: string, path: string, init: RequestInit = {}) {
  const response = await fetch(`${base}${path}`, { ...init, headers: { 'content-type': 'application/json', ...(init.headers || {}) } });
  const body = await response.json();
  return { status: response.status, body };
}

async function main() {
  assert(
    ['kentexa_phaseb_integration', 'kentexa_migration_validation'].includes(
      process.env.DB_NAME || '',
    ),
    'Refusing non-disposable database',
  );
  assert(process.env.TYPEORM_SYNCHRONIZE === 'false', 'synchronize must be false');
  const app = await NestFactory.create(IntegrationModule, {
    logger: ['error'],
    abortOnError: false,
  });
  await app.listen(0);
  const address = app.getHttpServer().address();
  const base = `http://127.0.0.1:${address.port}`;
  const db = app.get(DataSource);
  const users = db.getRepository(User); const roles = db.getRepository(AccountRole); const sellers = db.getRepository(SellerProfile); const sessions = db.getRepository(ActiveRoleSession);
  const password = await bcrypt.hash('IntegrationPass!1', 10);
  const user = await (users.save as any)(users.create({ email: 'phaseb@example.test', password, name: 'Phase B', isVerified: true } as any)) as User;
  const other = await (users.save as any)(users.create({ email: 'other@example.test', password, name: 'Other', isVerified: true } as any)) as User;
  const seller = await (sellers.save as any)(sellers.create({ user, businessName: 'Fixture Seller', status: 'approved' } as any)) as SellerProfile;
  const buyer = await roles.save(roles.create({ userId: user.id, roleType: AccountRoleType.BUYER, status: AccountRoleStatus.ACTIVE, profileType: RoleProfileType.USER, profileId: user.id, capabilities: {}, contextVersion: 1 }));
  const sellerRole = await roles.save(roles.create({ userId: user.id, roleType: AccountRoleType.SELLER, status: AccountRoleStatus.ACTIVE, profileType: RoleProfileType.SELLER_PROFILE, profileId: seller.id, capabilities: { 'test:allowed': true }, contextVersion: 1 }));
  const pending = await roles.save(roles.create({ userId: user.id, roleType: AccountRoleType.AGENT, status: AccountRoleStatus.PENDING, profileType: RoleProfileType.AGENT, profileId: 9999, capabilities: {}, contextVersion: 1 }));
  const otherBuyer = await roles.save(roles.create({ userId: other.id, roleType: AccountRoleType.BUYER, status: AccountRoleStatus.ACTIVE, profileType: RoleProfileType.USER, profileId: other.id, capabilities: {}, contextVersion: 1 }));

  const login = await request(base, '/auth/login', { method: 'POST', body: JSON.stringify({ identifier: user.email, password: 'IntegrationPass!1', deviceId: 'device-a' }) });
  assert(
    login.status === 201 && login.body.accessToken && login.body.access_token,
    `login contract failed: ${login.status} ${JSON.stringify(login.body)}`,
  );
  const buyerToken = login.body.accessToken; const buyerPayload = decode(buyerToken);
  assert(buyerPayload.sub === user.id && buyerPayload.rid === buyer.id && buyerPayload.rt === 'buyer' && buyerPayload.cv === 1 && buyerPayload.sid && buyerPayload.exp - buyerPayload.iat <= 1801, 'JWT contract/TTL failed');
  const buyerSession = await sessions.findOneByOrFail({ id: buyerPayload.sid });
  assert(buyerSession.accountRoleId === buyer.id && buyerSession.contextVersion === 1 && buyerSession.expiresAt.getTime() - Date.now() > 6 * 24 * 60 * 60 * 1000, 'session persistence/TTL failed');
  assert((await users.findOneByOrFail({ id: user.id })).role === 'user', 'login mutated User.role');

  const me = await request(base, '/auth/me', { headers: { authorization: `Bearer ${buyerToken}` } });
  assert(me.status === 200 && me.body.activeContext.accountRoleId === buyer.id, '/auth/me failed');
  const roleList = await request(base, '/auth/roles', { headers: { authorization: `Bearer ${buyerToken}` } });
  assert(roleList.status === 200 && roleList.body.availableRoles.length === 3 && roleList.body.availableRoles.find((r: any) => r.accountRoleId === pending.id).switchable === false, '/auth/roles isolation/switchable failed');
  assert((await request(base, '/phaseb-fixture/capability', { headers: { authorization: `Bearer ${buyerToken}`, 'x-capabilities': 'test:allowed' } })).status === 403, 'client capability injection succeeded');

  const switchSeller = await request(base, '/auth/switch-role', { method: 'POST', headers: { authorization: `Bearer ${buyerToken}` }, body: JSON.stringify({ accountRoleId: sellerRole.id, deviceId: 'device-a' }) });
  assert(switchSeller.status === 201, 'buyer to seller switch failed');
  const sellerToken = switchSeller.body.accessToken; const sellerPayload = decode(sellerToken);
  assert((await sessions.findOneByOrFail({ id: buyerPayload.sid })).revokeReason === 'role_switched' && sellerPayload.sid !== buyerPayload.sid && sellerPayload.rid === sellerRole.id, 'switch session lifecycle failed');
  const old = await request(base, '/auth/me', { headers: { authorization: `Bearer ${buyerToken}` } });
  assert(old.status === 401 && old.body.code === 'ROLE_CONTEXT_REVOKED', 'old token did not die');
  assert((await request(base, '/auth/me', { headers: { authorization: `Bearer ${sellerToken}` } })).status === 200, 'new seller token failed');
  assert((await request(base, '/phaseb-fixture/capability', { headers: { authorization: `Bearer ${sellerToken}` } })).status === 200, 'server capability failed');

  const jwt = app.get(JwtService);
  const { iat: _iat, exp: _exp, ...sellerClaims } = sellerPayload;
  const forgedRt = jwt.sign({ ...sellerClaims, rt: 'admin' });
  const forgedMe = await request(base, '/auth/me', { headers: { authorization: `Bearer ${forgedRt}` } });
  assert(forgedMe.status === 200 && forgedMe.body.activeContext.roleType === 'seller', 'forged rt changed authority');
  assert((await request(base, '/phaseb-fixture/admin-capability', { headers: { authorization: `Bearer ${forgedRt}` } })).status === 403, 'forged rt granted capability');
  const wrongTarget = await request(base, '/auth/switch-role', { method: 'POST', headers: { authorization: `Bearer ${sellerToken}` }, body: JSON.stringify({ accountRoleId: otherBuyer.id }) });
  assert(wrongTarget.status === 403 && wrongTarget.body.code === 'ROLE_NOT_SWITCHABLE', 'wrong-user switch not rejected');
  const mismatchRid = jwt.sign({ ...sellerClaims, rid: buyer.id });
  assert((await request(base, '/auth/me', { headers: { authorization: `Bearer ${mismatchRid}` } })).status === 401, 'mismatched sid/rid accepted');
  const invalidRid = jwt.sign({ ...sellerClaims, rid: 2147483647 });
  assert((await request(base, '/auth/me', { headers: { authorization: `Bearer ${invalidRid}` } })).status === 401, 'invalid rid accepted');

  const switchBuyer = await request(base, '/auth/switch-role', { method: 'POST', headers: { authorization: `Bearer ${sellerToken}` }, body: JSON.stringify({ accountRoleId: buyer.id, deviceId: 'device-a' }) });
  assert(switchBuyer.status === 201, 'seller to buyer switch failed');
  const returnedBuyerToken = switchBuyer.body.accessToken;
  assert((await sessions.findOneByOrFail({ id: sellerPayload.sid })).revokeReason === 'role_switched', 'seller session not revoked');
  assert((await request(base, '/auth/me', { headers: { authorization: `Bearer ${sellerToken}` } })).body.code === 'ROLE_CONTEXT_REVOKED', 'old seller token did not die');
  assert((await request(base, '/auth/me', { headers: { authorization: `Bearer ${returnedBuyerToken}` } })).status === 200, 'returned buyer token failed');

  const switchSellerAgain = await request(base, '/auth/switch-role', { method: 'POST', headers: { authorization: `Bearer ${returnedBuyerToken}` }, body: JSON.stringify({ accountRoleId: sellerRole.id, deviceId: 'device-a' }) });
  assert(switchSellerAgain.status === 201, 'second seller switch failed');
  const securitySellerToken = switchSellerAgain.body.accessToken;

  await roles.update(sellerRole.id, { contextVersion: 2 });
  const versionFail = await request(base, '/auth/me', { headers: { authorization: `Bearer ${securitySellerToken}` } });
  assert(versionFail.status === 401 && versionFail.body.code === 'ROLE_CONTEXT_VERSION_MISMATCH', 'version mismatch accepted');
  const freshSeller = await request(base, '/auth/login', { method: 'POST', body: JSON.stringify({ identifier: user.email, password: 'IntegrationPass!1', deviceId: 'device-b' }) });
  assert(freshSeller.status === 201, 'device-b login failed');
  const deviceBToken = freshSeller.body.accessToken;
  const independent = await request(base, '/auth/login', { method: 'POST', body: JSON.stringify({ identifier: user.email, password: 'IntegrationPass!1', deviceId: 'device-c' }) });
  assert(independent.status === 201, 'independent login failed');
  const independentToken = independent.body.accessToken;
  const logout = await request(base, '/auth/logout', { method: 'POST', headers: { authorization: `Bearer ${deviceBToken}` } });
  assert(logout.status === 201 && (await request(base, '/auth/logout', { method: 'POST', headers: { authorization: `Bearer ${deviceBToken}` } })).status === 201, 'logout idempotence failed');
  assert((await request(base, '/auth/me', { headers: { authorization: `Bearer ${deviceBToken}` } })).body.code === 'ROLE_CONTEXT_REVOKED', 'logout token still valid');
  assert((await request(base, '/auth/me', { headers: { authorization: `Bearer ${independentToken}` } })).status === 200, 'logout revoked independent session');

  await roles.update(buyer.id, { status: AccountRoleStatus.SUSPENDED });
  const suspended = await request(base, '/auth/me', { headers: { authorization: `Bearer ${independentToken}` } });
  assert(suspended.status === 401 && suspended.body.code === 'ROLE_NOT_ACTIVE', 'suspended role remained authorized');
  await roles.update(buyer.id, { status: AccountRoleStatus.ACTIVE });

  const freshBuyer = await request(base, '/auth/login', { method: 'POST', body: JSON.stringify({ identifier: user.email, password: 'IntegrationPass!1', deviceId: 'device-d' }) });
  const brokenSwitch = await request(base, '/auth/switch-role', { method: 'POST', headers: { authorization: `Bearer ${freshBuyer.body.accessToken}` }, body: JSON.stringify({ accountRoleId: sellerRole.id }) });
  assert(brokenSwitch.status === 201, 'broken-profile setup switch failed');
  await roles.update(sellerRole.id, { profileId: 2147483647 });
  const broken = await request(base, '/auth/me', { headers: { authorization: `Bearer ${brokenSwitch.body.accessToken}` } });
  assert(broken.status === 401 && broken.body.code === 'ROLE_PROFILE_INVALID', 'broken profile remained authorized');
  console.log(JSON.stringify({ passed: ['login','me','roles','inactive-role','switch','old-token-revocation','seller-to-buyer','forged-rt','wrong-user','invalid-rid','mismatched-sid-rid','context-version','capability-positive','capability-negative','client-capability-rejected','logout','independent-session','suspended-role','broken-profile'], sessions: await sessions.count(), roles: await roles.count(), businessWrites: 0 }));
  await app.close();
}
main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
