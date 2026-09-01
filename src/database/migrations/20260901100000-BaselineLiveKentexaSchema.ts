import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { MigrationInterface, QueryRunner } from 'typeorm';

const BASELINE_DUMP_PATH = join(
  process.cwd(),
  'database',
  'kentexa-live-schema.sql',
);

/**
 * Returns the exact schema-only pg_dump payload after removing psql-only
 * commands. The dump was taken from the live kentexa database on 2026-09-01
 * using pg_dump 16.14 with --schema-only --no-owner --no-privileges.
 */
/**
 * This establishes an empty database at the exact captured live schema.
 * Existing production databases must record this migration as applied via the
 * reviewed baseline-adoption procedure; they must never execute this `up`.
 */
export class BaselineLiveKentexaSchema20260901100000
  implements MigrationInterface
{
  name = 'BaselineLiveKentexaSchema20260901100000';

  static readSchemaOnlyDump(): string {
    if (!existsSync(BASELINE_DUMP_PATH)) {
      throw new Error(
        `Kentexa baseline dump is missing: ${BASELINE_DUMP_PATH}. ` +
          'Do not run the baseline migration without the reviewed live dump.',
      );
    }
    return readFileSync(BASELINE_DUMP_PATH, 'utf8')
      .split(/\r?\n/)
      .filter((line) => !/^\\(?:restrict|unrestrict)\b/.test(line))
      .join('\n');
  }

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(BaselineLiveKentexaSchema20260901100000.readSchemaOnlyDump());
  }

  async down(): Promise<void> {
    throw new Error(
      'The Kentexa live-schema baseline is intentionally non-reversible. ' +
        'Do not drop an established schema through migration rollback.',
    );
  }
}
