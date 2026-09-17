import { Injectable, ForbiddenException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CommerceProfile,
  CommerceProfileStatus,
  CommerceProfileType,
} from './entities/commerce-profile.entity';
import { CommerceProfileMember } from './entities/commerce-profile-member.entity';
import {
  OperationalWorkspace,
  OperationalWorkspaceStatus,
} from '../business/entities/operational-workspace.entity';
import { SellerScope } from '../business/seller-scope.service';
import { RoleProfileType } from '../role-context/entities/account-role.entity';

// Generalizes SellerScopeService (src/business/seller-scope.service.ts) from
// "one business per seller account" to "any CommerceProfile, owned or
// staffed" — same permission shape, scoped to a specific profile id instead
// of resolving a single default business. SellerScopeService and
// BusinessTeamMember are left untouched; this is what every NEW
// profile-type (hub staff, transport company staff, and sellers acting
// through the profile switcher) builds on going forward.
export type CommerceProfilePermission =
  | 'canViewOrders'
  | 'canCreateOrders'
  | 'canViewCustomers'
  | 'canSendMessages'
  | 'canViewRevenue'
  | 'canManageProducts'
  | 'canManageTeam'
  | 'canManageBrandAuthorization';

@Injectable()
export class CommerceProfileScopeService {
  constructor(
    @InjectRepository(CommerceProfile)
    private profileRepo: Repository<CommerceProfile>,
    @InjectRepository(CommerceProfileMember)
    private memberRepo: Repository<CommerceProfileMember>,
    @InjectRepository(OperationalWorkspace)
    private workspaceRepo: Repository<OperationalWorkspace>,
  ) {}

  /**
   * Resolves listing identity from the already-authoritative RoleContext
   * projection in SellerScope. A workspace-scoped request is deliberately
   * resolved by workspace/business linkage, never by a client-selected
   * CommerceProfile or by broad user ownership.
   *
   * CommerceProfile.businessId is not structurally unique today, so exact
   * cardinality is enforced here: zero or multiple active BUSINESS profiles
   * fail closed instead of silently choosing an arbitrary row.
   */
  async resolveForListingScope(scope: SellerScope): Promise<number | null> {
    if (scope.mode === 'workspace') {
      if (scope.workspaceId == null || scope.businessId == null) {
        throw this.unresolvedWorkspaceProfile();
      }

      const workspace = await this.workspaceRepo.findOne({
        where: {
          id: scope.workspaceId,
          businessId: scope.businessId,
          status: OperationalWorkspaceStatus.ACTIVE,
        },
      });
      if (!workspace) throw this.unresolvedWorkspaceProfile();

      const profiles = await this.profileRepo.find({
        where: {
          businessId: workspace.businessId,
          type: CommerceProfileType.BUSINESS,
          status: CommerceProfileStatus.ACTIVE,
        },
        take: 2,
      });
      if (profiles.length !== 1) throw this.unresolvedWorkspaceProfile();
      return profiles[0].id;
    }

    // A validated, intentionally unbound legacy Seller still carries its
    // authoritative SellerProfile binding. Resolve that exact backing
    // profile when it is unambiguous; personal/non-seller contexts remain
    // account-scoped and require no CommerceProfile.
    if (
      scope.profileType === RoleProfileType.SELLER_PROFILE &&
      scope.profileId != null
    ) {
      const profiles = await this.profileRepo.find({
        where: {
          sellerProfileId: scope.profileId,
          type: CommerceProfileType.BUSINESS,
          status: CommerceProfileStatus.ACTIVE,
        },
        take: 2,
      });
      if (profiles.length > 1) {
        throw new ConflictException({
          code: 'COMMERCE_PROFILE_LEGACY_AMBIGUOUS',
          message: 'Legacy seller profile has ambiguous commerce identity.',
        });
      }
      return profiles[0]?.id ?? null;
    }

    // Personal/account-scoped context: resolve the poster's own PERSONAL
    // CommerceProfile explicitly, rather than leaving commerceProfileId
    // null. A bare null is otherwise indistinguishable from a listing that
    // predates this column entirely (which intentionally still falls back
    // to the account's BUSINESS identity in ClassifiedsService.findOne()/
    // ProductsService.findOne(), matching pre-personal-classified-era
    // behavior for those legacy rows) -- stamping the real Personal
    // profile id here is what lets a genuinely personal listing display
    // and route as Personal, without backfilling any existing row.
    const personal = await this.profileRepo.findOne({
      where: {
        ownerId: scope.legacySellerId,
        type: CommerceProfileType.PERSONAL,
      },
    });
    return personal?.id ?? null;
  }

  private unresolvedWorkspaceProfile(): ConflictException {
    return new ConflictException({
      code: 'COMMERCE_PROFILE_WORKSPACE_UNRESOLVED',
      message: 'Workspace commerce identity could not be resolved uniquely.',
    });
  }

  // Whether `userId` may act on this specific profile — as its owner, or
  // as an active member with the given permission. Never picks a
  // "default" profile the way SellerScopeService.resolve() does; the
  // caller always already knows which profile it's asking about. Takes a
  // plain id rather than a User entity since every call site here only
  // ever has req.user.id (the JWT payload), not a hydrated User row.
  async isAuthorizedFor(
    userId: number,
    commerceProfileId: number,
    permission?: CommerceProfilePermission,
  ): Promise<boolean> {
    const profile = await this.profileRepo.findOne({
      where: { id: commerceProfileId },
    });
    if (!profile) return false;
    if (profile.ownerId === userId) return true;

    const membership = await this.memberRepo.findOne({
      where: { userId, commerceProfileId, isActive: true },
    });
    return (
      !!membership && (!permission || !!membership.permissions?.[permission])
    );
  }

  async requireAuthorized(
    userId: number,
    commerceProfileId: number,
    permission?: CommerceProfilePermission,
  ): Promise<void> {
    if (!(await this.isAuthorizedFor(userId, commerceProfileId, permission))) {
      throw new ForbiddenException(
        permission
          ? `You don't have the "${permission}" permission for this profile.`
          : 'You are not authorized to manage this profile.',
      );
    }
  }
}
