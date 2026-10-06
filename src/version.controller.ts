import { Controller, Get } from '@nestjs/common';

const startedAt = new Date().toISOString();

/**
 * Release control (logistics repair Gate 0): which commit is this process
 * actually running?
 *
 * The 6 October 2026 logistics audit found reviewed fixes merged to a branch
 * production did not deploy, and could only infer the deployed commit by
 * probing for routes. This endpoint answers the question directly.
 *
 * RENDER_GIT_COMMIT / RENDER_GIT_BRANCH are set by Render on every deploy.
 * Both are public facts about a public repository; nothing else is exposed.
 * Outside Render (local, CI) they are absent and reported as null.
 */
@Controller('version')
export class VersionController {
  @Get()
  getVersion() {
    return {
      service: 'kentexa-backend',
      commit: process.env.RENDER_GIT_COMMIT || null,
      branch: process.env.RENDER_GIT_BRANCH || null,
      startedAt,
    };
  }
}
