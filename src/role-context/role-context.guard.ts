import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { RoleContextException } from './role-context.exception';
import { RoleContextService } from './role-context.service';
import { RoleJwtPayload } from './role-context.types';

@Injectable()
export class RoleContextGuard implements CanActivate {
  constructor(private readonly roleContextService: RoleContextService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const payload = request.user?.authPayload as RoleJwtPayload | undefined;
    if (!payload?.sub || !payload.sid || !payload.rid || payload.cv === undefined) {
      throw new RoleContextException('ROLE_CONTEXT_MISSING');
    }
    request.roleContext = await this.roleContextService.resolveContext(payload);
    return true;
  }
}
