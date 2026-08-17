import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Wallet } from './entities/wallet.entity';
import {
  WalletTransaction,
  WalletTransactionType,
  WalletTransactionStatus,
} from './entities/wallet-transaction.entity';

@Injectable()
export class WalletService {
  constructor(
    @InjectRepository(Wallet) private walletRepo: Repository<Wallet>,
    @InjectRepository(WalletTransaction)
    private txRepo: Repository<WalletTransaction>,
  ) {}

  async getOrCreateWallet(userId: number): Promise<Wallet> {
    let wallet = await this.walletRepo.findOne({ where: { userId } });
    if (!wallet) {
      wallet = await this.walletRepo.save(
        this.walletRepo.create({ userId, user: { id: userId } as any }),
      );
    }
    return wallet;
  }

  // Called additively from orders.service.ts's three existing escrow-release
  // points, alongside (not instead of) the existing Payout row — Payout
  // stays the historical/audit record, Wallet becomes the live balance.
  // Never throws: a wallet-credit failure must not roll back or block the
  // escrow release itself, same non-fatal convention used for reputation
  // awards at the same call sites.
  async creditFromEscrowRelease(
    sellerId: number,
    orderId: number,
    amount: number,
  ): Promise<void> {
    if (!sellerId || !amount || amount <= 0) return;
    const wallet = await this.getOrCreateWallet(sellerId);
    const newBalance = Number(wallet.balance) + Number(amount);
    await this.walletRepo.update(wallet.id, {
      balance: newBalance,
      totalEarned: Number(wallet.totalEarned) + Number(amount),
    });
    await this.txRepo.save(
      this.txRepo.create({
        walletId: wallet.id,
        type: WalletTransactionType.CREDIT_ESCROW_RELEASE,
        amount,
        balanceAfter: newBalance,
        referenceType: 'order',
        referenceId: orderId,
        status: WalletTransactionStatus.COMPLETED,
      }),
    );
  }

  async getWallet(userId: number) {
    const wallet = await this.getOrCreateWallet(userId);
    const transactions = await this.txRepo.find({
      where: { walletId: wallet.id },
      order: { createdAt: 'DESC' },
      take: 50,
    });
    return { wallet, transactions };
  }

  async requestWithdrawal(
    userId: number,
    amount: number,
  ): Promise<WalletTransaction> {
    if (!amount || amount <= 0)
      throw new BadRequestException('Invalid withdrawal amount');
    const wallet = await this.getOrCreateWallet(userId);
    if (Number(wallet.balance) < amount)
      throw new BadRequestException('Insufficient wallet balance');

    const newBalance = Number(wallet.balance) - amount;
    await this.walletRepo.update(wallet.id, {
      balance: newBalance,
      pendingBalance: Number(wallet.pendingBalance) + amount,
    });
    return this.txRepo.save(
      this.txRepo.create({
        walletId: wallet.id,
        type: WalletTransactionType.WITHDRAWAL_REQUESTED,
        amount,
        balanceAfter: newBalance,
        status: WalletTransactionStatus.PENDING,
      }),
    );
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
    const tx = await this.txRepo.findOne({
      where: { id: txId },
      relations: { wallet: true },
    });
    if (!tx) throw new NotFoundException('Withdrawal request not found');
    if (tx.status !== WalletTransactionStatus.PENDING)
      throw new BadRequestException('Withdrawal already processed');

    const wallet = tx.wallet;
    await this.walletRepo.update(wallet.id, {
      pendingBalance: Math.max(0, Number(wallet.pendingBalance) - Number(tx.amount)),
      totalWithdrawn: Number(wallet.totalWithdrawn) + Number(tx.amount),
    });
    tx.status = WalletTransactionStatus.COMPLETED;
    tx.type = WalletTransactionType.WITHDRAWAL_PAID;
    return this.txRepo.save(tx);
  }

  async rejectWithdrawal(txId: number, reason?: string): Promise<WalletTransaction> {
    const tx = await this.txRepo.findOne({
      where: { id: txId },
      relations: { wallet: true },
    });
    if (!tx) throw new NotFoundException('Withdrawal request not found');
    if (tx.status !== WalletTransactionStatus.PENDING)
      throw new BadRequestException('Withdrawal already processed');

    const wallet = tx.wallet;
    const restoredBalance = Number(wallet.balance) + Number(tx.amount);
    await this.walletRepo.update(wallet.id, {
      balance: restoredBalance,
      pendingBalance: Math.max(0, Number(wallet.pendingBalance) - Number(tx.amount)),
    });
    tx.status = WalletTransactionStatus.REJECTED;
    tx.type = WalletTransactionType.WITHDRAWAL_REJECTED;
    tx.note = reason || null;
    return this.txRepo.save(tx);
  }
}
