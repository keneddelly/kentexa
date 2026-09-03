import { Injectable, Logger } from '@nestjs/common';

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

// Stage 2B item 9: two dev/test-only rollback flags -- ROLE_CONTEXT_SOCKET_AUTH
// and ROLE_CONTEXT_SOCKET_ROOMS -- exist so a real regression can be isolated
// during development. Their INSECURE combination (auth disabled, or rooms
// disabled while auth stays on -- both collapse onto the old sub-only-JWT +
// generic user:{userId} room delivery, exactly the pre-Stage-2 leak) must
// never be reachable in production, not even via a stray env var. This is
// the "production-safe fallback" the item requires: NOT "old auth + generic
// room" -- these two flags are HARD-forced true whenever NODE_ENV is
// 'production', regardless of what COMM_FLAG_ROLE_CONTEXT_SOCKET_AUTH/
// COMM_FLAG_ROLE_CONTEXT_SOCKET_ROOMS are set to. A misconfigured production
// env var can only ever fail to weaken security here -- it cannot silently
// restore the known-insecure delivery path. Every other flag stays fully
// env-driven in every environment.
const PRODUCTION_LOCKED_SECURE: CommunicationFeatureFlag[] = [
  'ROLE_CONTEXT_SOCKET_AUTH',
  'ROLE_CONTEXT_SOCKET_ROOMS',
];

@Injectable()
export class CommunicationFeatureFlagsService {
  private readonly logger = new Logger(CommunicationFeatureFlagsService.name);
  private warnedProductionOverride = new Set<string>();

  isEnabled(flag: CommunicationFeatureFlag): boolean {
    const envKey = `COMM_FLAG_${flag}`;
    const raw = process.env[envKey];

    if (process.env.NODE_ENV === 'production' && PRODUCTION_LOCKED_SECURE.includes(flag)) {
      if (raw === 'false' && !this.warnedProductionOverride.has(flag)) {
        this.warnedProductionOverride.add(flag);
        this.logger.warn(
          `${envKey}=false was set in production but ${flag} is production-locked to secure realtime delivery -- ignoring the override. Disabling this flag is only ever honored outside production (see communication-feature-flags.service.ts).`,
        );
      }
      return true;
    }

    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return DEFAULTS[flag];
  }
}
