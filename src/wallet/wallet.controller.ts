import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
  Request,
} from '@nestjs/common';
import { WalletService } from './wallet.service';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { SellerScopeService } from '../business/seller-scope.service';

@Controller('seller/wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(
    private walletService: WalletService,
    private sellerScope: SellerScopeService,
  ) {}

  @Get()
  async getWallet(@Request() req) {
    const sellerId = await this.resolveOrSelf(req.user, 'canViewRevenue');
    return this.walletService.getWallet(sellerId);
  }

  @Post('withdraw')
  async withdraw(@Request() req, @Body('amount') amount: number) {
    const sellerId = await this.resolveOrSelf(req.user, 'canViewRevenue');
    return this.walletService.requestWithdrawal(sellerId, Number(amount));
  }

  private async resolveOrSelf(
    user: any,
    permission: Parameters<SellerScopeService['resolve']>[1],
  ): Promise<number> {
    try {
      return await this.sellerScope.resolve(user, permission);
    } catch {
      return user.id;
    }
  }
}

@Controller('admin/wallet-withdrawals')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminWalletController {
  constructor(private walletService: WalletService) {}

  @Get()
  list() {
    return this.walletService.listPendingWithdrawals();
  }

  @Patch(':id/approve')
  approve(@Param('id', ParseIntPipe) id: number) {
    return this.walletService.approveWithdrawal(id);
  }

  @Patch(':id/reject')
  reject(
    @Param('id', ParseIntPipe) id: number,
    @Body('reason') reason?: string,
  ) {
    return this.walletService.rejectWithdrawal(id, reason);
  }
}
