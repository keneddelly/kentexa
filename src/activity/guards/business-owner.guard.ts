import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { UserRole } from '../../users/entities/user.entity';

// Phase 1: businessId is just the seller's User.id, so ownership is a direct
// comparison. Does not yet consult BusinessTeamMember delegated permissions —
// add that once delegated team access to intelligence data is requested.
@Injectable()
export class BusinessOwnerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) throw new ForbiddenException('Not authenticated');

    if (user.role === UserRole.ADMIN) return true;

    const businessId = Number(request.params.businessId);
    if (!businessId || user.id !== businessId) {
      throw new ForbiddenException(
        'You may only view intelligence data for your own business.',
      );
    }
    return true;
  }
}
