import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'events';

export interface RoleSessionRevokedEvent {
  /** Set when exactly one session was revoked (logout, role switch). */
  sessionId?: string;
  /** Set when every session for a role was revoked in bulk (suspend/reject). */
  accountRoleId?: number;
  reason: string;
}

/**
 * Dependency-free in-process pub/sub (plain Node EventEmitter, no new
 * package) so RoleContextService can announce session revocation without
 * importing socket/gateway code, and any realtime layer (ConversationGateway
 * today, others later) can react without RoleContextModule depending on
 * them. RoleContextModule is @Global(), so this is injectable everywhere.
 */
@Injectable()
export class RoleSessionEventsService {
  private readonly emitter = new EventEmitter();

  constructor() {
    // A socket gateway can hold many connections; default max-listeners (10)
    // is not a real leak signal here.
    this.emitter.setMaxListeners(0);
  }

  emitRevoked(event: RoleSessionRevokedEvent): void {
    this.emitter.emit('revoked', event);
  }

  onRevoked(handler: (event: RoleSessionRevokedEvent) => void): void {
    this.emitter.on('revoked', handler);
  }
}
