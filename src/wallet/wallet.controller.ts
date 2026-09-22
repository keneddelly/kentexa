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
import { ActiveRoleGuard } from '../role-context/active-role.guard';
import { RequireActiveRole } from '../role-context/require-active-role.decorator';
import { AccountRoleType } from '../role-context/entities/account-role.entity';
import { SellerScopeService, NoTeamMembershipException } from '../business/seller-scope.service';
import { RoleContextGuard } from '../role-context/role-context.guard';
import { CurrentRoleContext } from '../role-context/current-role-context.decorator';
import type { RoleContext } from '../role-context/role-context.types';

/**
 * I2G: the wallet is resolved from the AUTHENTICATED acting context, never
 * from the user id alone. A BUSINESS context reads/withdraws its workspace
 * wallet (authorization failures propagate -- there is no swallow-all
 * fallback to the person's own wallet); every other context reads the
 * Personal wallet exactly as before. A revoked/invalid session fails closed.
 */
@Controller('seller/wallet')
@UseGuards(JwtAuthGuard, RoleContextGuard)
export class WalletController {
  constructor(
    private walletService: WalletService,
    private sellerScope: SellerScopeService,
  ) {}

  @Get()
  async getWallet(@Request() req, @CurrentRoleContext() ctx: RoleContext) {
    if (ctx.identityType === 'BUSINESS') {
      await this.sellerScope.resolve(req.user, 'canViewRevenue'); // throws -> fail closed
      return this.walletService.getWalletForContext(ctx);
    }
    const ownerId = await this.legacyOwnerId(req.user);
    return this.walletService.getWalletForContext({ identityType: ctx.identityType, workspaceId: null, userId: ownerId });
  }

  @Post('withdraw')
  async withdraw(@Request() req, @CurrentRoleContext() ctx: RoleContext, @Body('amount') amount: number) {
    if (ctx.identityType === 'BUSINESS') {
      await this.sellerScope.resolve(req.user, 'canViewRevenue');
      return this.walletService.requestBusinessWithdrawal(ctx, Number(amount));
    }
    const ownerId = await this.legacyOwnerId(req.user);
    return this.walletService.requestPersonalWithdrawal(ownerId, Number(amount));
  }

  // Legacy Personal/team-delegation compatibility. ONLY the exact
  // NoTeamMembershipException ("this caller is not a member of anyone's business, so they
  // are simply using their own wallet") selects the caller's Personal wallet. Every other
  // failure -- revoked/expired session (RoleContextException), a member lacking the
  // permission, workspace/scope mismatches, database or internal errors, anything unknown --
  // propagates: uncertain authority never selects a wallet.
  private async legacyOwnerId(user: any): Promise<number> {
    try {
      return await this.sellerScope.resolve(user, 'canViewRevenue');
    } catch (e) {
      if (e instanceof NoTeamMembershipException) return user.id;
      throw e;
    }
  }
}

// I2G financial administration: canonical server-validated RoleContext, exact ACTIVE admin role
// (never legacy User.role). Same mechanism as every other financial-admin controller.
@Controller('admin/wallet-withdrawals')
@UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
@RequireActiveRole(AccountRoleType.ADMIN)
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
