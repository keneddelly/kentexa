import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Wallet } from './entities/wallet.entity';
import {
  WalletTransaction,
  WalletTransactionType,
  WalletTransactionStatus,
} from './entities/wallet-transaction.entity';
import { User } from '../users/entities/user.entity';
import { VerificationService } from '../identity/verification.service';
import { PayoutDestinationService } from './payout-destination.service';
import { OwnershipFeatureFlagsService } from '../ownership/ownership-feature-flags.service';
import { MoneyRoutingTargetType } from '../money-routing/entities/money-routing-entry.entity';
import {
  MoneyRoutingBlockedException,
  resolveOrderRoutingTarget,
} from '../money-routing/order-routing-target';
import type { RoleContext } from '../role-context/role-context.types';
import { qRows } from '../money-routing/pg-rows';

/**
 * I2G wallet ownership. A wallet has EXACTLY ONE owner (DB CHECK):
 *   Personal wallet -> userId, workspaceId NULL
 *   Business wallet -> workspaceId, userId NULL
 * Resolution is ALWAYS explicit -- there is no generic "wallet for this
 * user" lookup that could guess Business from common User ownership.
 * Balance mutations are single guarded UPDATEs executed in the same
 * transaction as the ledger insert.
 */
@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    @InjectRepository(Wallet) private walletRepo: Repository<Wallet>,
    @InjectRepository(WalletTransaction)
    private txRepo: Repository<WalletTransaction>,
    @InjectRepository(User) private userRepo: Repository<User>,
    private dataSource: DataSource,
    private verification: VerificationService,
    private payoutDestinations: PayoutDestinationService,
    private flags: OwnershipFeatureFlagsService,
  ) {}

  // ── Explicit resolvers ────────────────────────────────────────────────────
  //
  // S0 x I2G integration gate: S0's original creditFromEscrowRelease(sellerId, orderId, amount)
  // backstop — a direct, generic "credit this user id" wallet write — is REMOVED here, not merely
  // adapted. It is structurally incompatible with I2G's wallet-ownership model (there is no longer
  // a generic "wallet for this user" lookup to guess Business from common User ownership; Personal
  // vs Business wallets are resolved explicitly, only by workspace/routing target) and it would
  // additionally be a second, competing writer of seller proceeds alongside OrderReleaseService —
  // exactly the "direct wallet credit bypassing canonical routing/release" this integration must
  // not reintroduce. Its actual job — refuse a checkout order's seller credit when verified
  // PaymentEvidence is missing — is preserved, but at the canonical choke point instead:
  // OrderReleaseService.releaseSellerProceeds() now independently re-checks PaymentEvidence itself
  // before routing or crediting, so every release path gets this backstop uniformly (not just the
  // call sites S0 happened to touch).
  async getOrCreatePersonalWallet(userId: number, manager?: EntityManager): Promise<Wallet> {
    if (!Number.isInteger(userId) || userId <= 0) throw new BadRequestException('WALLET_OWNER_REQUIRED');
    const m = manager ?? this.dataSource.manager;
    await m.query(
      `INSERT INTO wallet ("userId", "workspaceId") VALUES ($1, NULL) ON CONFLICT ("userId") WHERE "workspaceId" IS NULL DO NOTHING`,
      [userId],
    );
    const rows = await m.query(`SELECT * FROM wallet WHERE "userId" = $1 AND "workspaceId" IS NULL`, [userId]);
    return this.toWallet(rows[0]);
  }

  async getOrCreateBusinessWallet(workspaceId: number, manager?: EntityManager): Promise<Wallet> {
    if (!Number.isInteger(workspaceId) || workspaceId <= 0) throw new BadRequestException('WALLET_OWNER_REQUIRED');
    const m = manager ?? this.dataSource.manager;
    const ws = await m.query(`SELECT id FROM operational_workspace WHERE id = $1`, [workspaceId]);
    if (!ws[0]) throw new NotFoundException({ code: 'WORKSPACE_NOT_FOUND', message: 'WORKSPACE_NOT_FOUND' });
    await m.query(
      `INSERT INTO wallet ("userId", "workspaceId") VALUES (NULL, $1) ON CONFLICT ("workspaceId") WHERE "workspaceId" IS NOT NULL DO NOTHING`,
      [workspaceId],
    );
    const rows = await m.query(`SELECT * FROM wallet WHERE "workspaceId" = $1`, [workspaceId]);
    return this.toWallet(rows[0]);
  }

  /** The wallet of the authenticated acting context: BUSINESS -> its workspace wallet; anything else -> the person's Personal wallet. */
  async walletForContext(ctx: Pick<RoleContext, 'identityType' | 'workspaceId' | 'userId'>, manager?: EntityManager): Promise<Wallet> {
    if (ctx.identityType === 'BUSINESS') {
      if (ctx.workspaceId == null) {
        throw new ConflictException({ code: 'WALLET_CONTEXT_UNRESOLVED', message: 'WALLET_CONTEXT_UNRESOLVED' });
      }
      return this.getOrCreateBusinessWallet(ctx.workspaceId, manager);
    }
    return this.getOrCreatePersonalWallet(ctx.userId, manager);
  }

  /** The wallet a seller credit for this order belongs to (fail-closed; see resolveOrderRoutingTarget). */
  async walletForOrder(orderId: number, manager?: EntityManager): Promise<Wallet> {
    const m = manager ?? this.dataSource.manager;
    const target = await resolveOrderRoutingTarget(m, orderId);
    if (target.kind === 'BLOCKED') throw new MoneyRoutingBlockedException(target.reason, target.detail);
    if (target.kind === 'NOT_APPLICABLE') {
      throw new ConflictException({ code: 'WALLET_NOT_APPLICABLE', message: 'WALLET_NOT_APPLICABLE', orderId });
    }
    return target.targetType === MoneyRoutingTargetType.BUSINESS_WORKSPACE
      ? this.getOrCreateBusinessWallet(target.workspaceId, m)
      : this.getOrCreatePersonalWallet(target.userId, m);
  }

  private toWallet(row: any): Wallet {
    if (!row) throw new ConflictException({ code: 'WALLET_UNRESOLVABLE', message: 'WALLET_UNRESOLVABLE' });
    return this.walletRepo.create({
      ...row,
      balance: row.balance,
      pendingBalance: row.pendingBalance,
      totalEarned: row.totalEarned,
      totalWithdrawn: row.totalWithdrawn,
    } as any) as unknown as Wallet;
  }

  // ── Atomic mutations (caller supplies the transaction) ────────────────────

  /** Credit: one guarded UPDATE + the ledger row, in the caller's transaction. */
  async creditWallet(
    manager: EntityManager,
    walletId: number,
    amount: number,
    ledger: { type: WalletTransactionType; referenceType?: string | null; referenceId?: number | null; routingEntryId?: number | null; note?: string | null },
  ): Promise<{ transactionId: number; balanceAfter: number }> {
    if (!(amount > 0)) throw new BadRequestException('INVALID_AMOUNT');
    const upd = await qRows(manager, 
      `UPDATE wallet SET balance = balance + $2, "totalEarned" = "totalEarned" + $2, "updatedAt" = now()
        WHERE id = $1 RETURNING balance`,
      [walletId, amount],
    );
    if (!upd[0]) throw new ConflictException({ code: 'WALLET_UNRESOLVABLE', message: 'WALLET_UNRESOLVABLE' });
    const tx = await manager.query(
      `INSERT INTO wallet_transaction ("walletId", type, amount, "balanceAfter", "referenceType", "referenceId", status, "routingEntryId", note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [walletId, ledger.type, amount, upd[0].balance, ledger.referenceType ?? null, ledger.referenceId ?? null,
        WalletTransactionStatus.COMPLETED, ledger.routingEntryId ?? null, ledger.note ?? null],
    );
    return { transactionId: tx[0].id, balanceAfter: Number(upd[0].balance) };
  }

  // ── Reads ─────────────────────────────────────────────────────────────────

  async getWalletForContext(ctx: Pick<RoleContext, 'identityType' | 'workspaceId' | 'userId'>) {
    const wallet = await this.walletForContext(ctx);
    const transactions = await this.txRepo.find({
      where: { walletId: wallet.id },
      order: { createdAt: 'DESC' },
      take: 50,
    });
    return { wallet, transactions };
  }

  // ── Withdrawals ───────────────────────────────────────────────────────────

  /**
   * Personal withdrawal: pays the person's own User.payout* destination
   * (unchanged behaviour), now with an immutable snapshot on the ledger row.
   */
  async requestPersonalWithdrawal(userId: number, amount: number): Promise<WalletTransaction> {
    if (!amount || amount <= 0) throw new BadRequestException('Invalid withdrawal amount');
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user?.payoutMethod || !user?.payoutAccountName || !user?.payoutAccountNumber) {
      throw new BadRequestException(
        'Add your payout details (method, account name, account number) before requesting a withdrawal.',
      );
    }
    const level = await this.verification.getLevel(userId);
    if (level < 1) {
      throw new ForbiddenException({
        code: 'VERIFICATION_REQUIRED',
        requiredLevel: 1,
        message: 'Verify your identity before withdrawing earnings',
      });
    }
    const snapshot = {
      kind: 'PERSONAL_USER',
      userId,
      method: user.payoutMethod,
      accountName: user.payoutAccountName,
      accountNumber: user.payoutAccountNumber,
      bankName: (user as any).payoutBankName ?? null,
      capturedAt: new Date().toISOString(),
    };
    return this.dataSource.transaction(async (m) => {
      const wallet = await this.getOrCreatePersonalWallet(userId, m);
      return this.debitForWithdrawal(m, wallet.id, amount, null, snapshot);
    });
  }

  /**
   * Business withdrawal: from the workspace wallet, to the workspace's own
   * verified, usable payout destination. NEVER the owner's User.payout*.
   * Authorization (exact BUSINESS context + Business owner) is enforced by
   * PayoutDestinationService.assertBusinessOwner before any money moves.
   */
  async requestBusinessWithdrawal(
    ctx: Pick<RoleContext, 'identityType' | 'workspaceId' | 'userId'>,
    amount: number,
  ): Promise<WalletTransaction> {
    if (!this.flags.isEnabled('BUSINESS_WITHDRAWAL_ENABLED')) {
      throw new ForbiddenException({ code: 'BUSINESS_WITHDRAWAL_DISABLED', message: 'BUSINESS_WITHDRAWAL_DISABLED' });
    }
    if (!amount || amount <= 0) throw new BadRequestException('Invalid withdrawal amount');
    const workspaceId = await this.payoutDestinations.assertBusinessOwner(ctx);
    const destination = await this.payoutDestinations.getUsableDestination(workspaceId);
    return this.dataSource.transaction(async (m) => {
      const wallet = await this.getOrCreateBusinessWallet(workspaceId, m);
      const snapshot = {
        kind: 'BUSINESS_WORKSPACE',
        workspaceId,
        payoutDestinationId: destination.id,
        method: destination.method,
        accountName: destination.accountName,
        accountNumber: destination.accountNumber,
        bankName: destination.bankName,
        capturedAt: new Date().toISOString(),
      };
      return this.debitForWithdrawal(m, wallet.id, amount, destination.id, snapshot);
    });
  }

  private async debitForWithdrawal(
    m: EntityManager,
    walletId: number,
    amount: number,
    payoutDestinationId: number | null,
    snapshot: Record<string, unknown>,
  ): Promise<WalletTransaction> {
    const upd = await qRows(m, 
      `UPDATE wallet SET balance = balance - $2, "pendingBalance" = "pendingBalance" + $2, "updatedAt" = now()
        WHERE id = $1 AND balance >= $2 RETURNING balance`,
      [walletId, amount],
    );
    if (!upd[0]) throw new BadRequestException('Insufficient wallet balance');
    const rows = await m.query(
      `INSERT INTO wallet_transaction ("walletId", type, amount, "balanceAfter", status, "payoutDestinationId", "payoutSnapshot")
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb) RETURNING *`,
      [walletId, WalletTransactionType.WITHDRAWAL_REQUESTED, amount, upd[0].balance,
        WalletTransactionStatus.PENDING, payoutDestinationId, JSON.stringify(snapshot)],
    );
    return this.txRepo.create(rows[0]) as unknown as WalletTransaction;
  }

  // ── Admin: withdrawal queue ───────────────────────────────────────────────
  async listPendingWithdrawals(): Promise<WalletTransaction[]> {
    return this.txRepo.find({
      where: {
        type: WalletTransactionType.WITHDRAWAL_REQUESTED,
        status: WalletTransactionStatus.PENDING,
      },
      relations: { wallet: { user: true } as any },
      order: { createdAt: 'ASC' },
    });
  }

  async approveWithdrawal(txId: number): Promise<WalletTransaction> {
    return this.dataSource.transaction(async (m) => {
      const rows = await m.query(`SELECT * FROM wallet_transaction WHERE id = $1 FOR UPDATE`, [txId]);
      const tx = rows[0];
      if (!tx) throw new NotFoundException('Withdrawal request not found');
      if (tx.status !== WalletTransactionStatus.PENDING) throw new BadRequestException('Withdrawal already processed');
      const upd = await qRows(m, 
        `UPDATE wallet SET "pendingBalance" = "pendingBalance" - $2, "totalWithdrawn" = "totalWithdrawn" + $2, "updatedAt" = now()
          WHERE id = $1 AND "pendingBalance" >= $2 RETURNING id`,
        [tx.walletId, tx.amount],
      );
      if (!upd[0]) throw new ConflictException({ code: 'WALLET_PENDING_MISMATCH', message: 'WALLET_PENDING_MISMATCH' });
      const done = await qRows(m, 
        `UPDATE wallet_transaction SET status = $2, type = $3 WHERE id = $1 RETURNING *`,
        [txId, WalletTransactionStatus.COMPLETED, WalletTransactionType.WITHDRAWAL_PAID],
      );
      return this.txRepo.create(done[0]) as unknown as WalletTransaction;
    });
  }

  async rejectWithdrawal(txId: number, reason?: string): Promise<WalletTransaction> {
    return this.dataSource.transaction(async (m) => {
      const rows = await m.query(`SELECT * FROM wallet_transaction WHERE id = $1 FOR UPDATE`, [txId]);
      const tx = rows[0];
      if (!tx) throw new NotFoundException('Withdrawal request not found');
      if (tx.status !== WalletTransactionStatus.PENDING) throw new BadRequestException('Withdrawal already processed');
      const upd = await qRows(m, 
        `UPDATE wallet SET balance = balance + $2, "pendingBalance" = "pendingBalance" - $2, "updatedAt" = now()
          WHERE id = $1 AND "pendingBalance" >= $2 RETURNING id`,
        [tx.walletId, tx.amount],
      );
      if (!upd[0]) throw new ConflictException({ code: 'WALLET_PENDING_MISMATCH', message: 'WALLET_PENDING_MISMATCH' });
      const done = await qRows(m, 
        `UPDATE wallet_transaction SET status = $2, type = $3, note = $4 WHERE id = $1 RETURNING *`,
        [txId, WalletTransactionStatus.REJECTED, WalletTransactionType.WITHDRAWAL_REJECTED, reason || null],
      );
      return this.txRepo.create(done[0]) as unknown as WalletTransaction;
    });
  }
}
