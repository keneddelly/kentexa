import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentRoleContext = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => context.switchToHttp().getRequest().roleContext,
);
