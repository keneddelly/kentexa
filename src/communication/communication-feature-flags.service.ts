import { Injectable } from '@nestjs/common';

/**
 * Independent Stage 2 rollout flags -- deliberately NOT one giant switch,
 * so dual-write can go out and soak long before any scoped READ path is
 * ever trusted, and so socket-auth/room changes can ship independently of
 * the REST read-path cutover. Env-var driven (this repo has no admin-UI
 * feature-flag store); every flag defaults to the conservative Stage 2
 * launch posture: writes on, scoped reads off.
 */
export type CommunicationFeatureFlag =
  | 'SCOPED_CONVERSATION_DUAL_WRITE'
  | 'SCOPED_CONVERSATION_READ'
  | 'SCOPED_NOTIFICATION_DUAL_WRITE'
  | 'SCOPED_NOTIFICATION_READ'
  | 'SCOPED_UNREAD_READ'
  | 'ROLE_CONTEXT_SOCKET_AUTH'
  | 'ROLE_CONTEXT_SOCKET_ROOMS'
  | 'COMMUNICATION_SHADOW_COMPARE'
  | 'LEGACY_COMMUNICATION_READ_FALLBACK';

// Writes default ON (dual-write must run before any read path can be
// trusted); scoped reads default OFF (#8: "Initial deployment behavior
// must keep scoped READS disabled until dual-write parity is proven");
// legacy fallback defaults ON (never strand a request with no read path).
const DEFAULTS: Record<CommunicationFeatureFlag, boolean> = {
  SCOPED_CONVERSATION_DUAL_WRITE: true,
  SCOPED_CONVERSATION_READ: false,
  SCOPED_NOTIFICATION_DUAL_WRITE: true,
  SCOPED_NOTIFICATION_READ: false,
  SCOPED_UNREAD_READ: false,
  ROLE_CONTEXT_SOCKET_AUTH: true,
  ROLE_CONTEXT_SOCKET_ROOMS: true,
  COMMUNICATION_SHADOW_COMPARE: false,
  LEGACY_COMMUNICATION_READ_FALLBACK: true,
};

@Injectable()
export class CommunicationFeatureFlagsService {
  isEnabled(flag: CommunicationFeatureFlag): boolean {
    const envKey = `COMM_FLAG_${flag}`;
    const raw = process.env[envKey];
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return DEFAULTS[flag];
  }
}
