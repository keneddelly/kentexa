import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRED_CAPABILITIES } from './capabilities';
import { RoleContext } from './role-context.types';

@Injectable()
export class CapabilityGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(REQUIRED_CAPABILITIES, [
      context.getHandler(), context.getClass(),
    ]) || [];
    if (required.length === 0) return true;
    const roleContext = context.switchToHttp().getRequest().roleContext as RoleContext | undefined;
    if (!roleContext || !required.every((capability) => roleContext.capabilities.includes(capability))) {
      throw new ForbiddenException({ code: 'CAPABILITY_REQUIRED', message: 'CAPABILITY_REQUIRED' });
    }
    return true;
  }
}
