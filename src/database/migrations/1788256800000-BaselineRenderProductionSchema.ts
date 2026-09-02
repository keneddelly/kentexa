import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { MigrationInterface, QueryRunner } from 'typeorm';

const BASELINE_DUMP_PATH = join(
  process.cwd(),
  'database',
  'kentexa-render-live-schema.sql',
);

/**
 * Establishes an empty database at the inspected Render production schema.
 * Existing Render databases must adopt this migration through the guarded
 * ledger-only adoption utility; they must never execute this `up()` method.
 */
export class BaselineRenderProductionSchema1788256800000
  implements MigrationInterface
{
  name = 'BaselineRenderProductionSchema1788256800000';

  static readSchemaOnlyDump(): string {
    if (!existsSync(BASELINE_DUMP_PATH)) {
      throw new Error(
        `Render baseline dump is missing: ${BASELINE_DUMP_PATH}. ` +
          'Do not run the baseline without the reviewed schema artifact.',
      );
    }

    const sql = readFileSync(BASELINE_DUMP_PATH, 'utf8')
      .split(/\r?\n/)
      .filter(
        (line) =>
          !/^\\(?:restrict|unrestrict)\b/.test(line) &&
          !/^SELECT pg_catalog\.set_config\('search_path', '', false\);$/.test(
            line,
          ),
      )
      .join('\n');

    const forbidden = [
      [/^DROP SCHEMA\s+public\b/im, 'DROP SCHEMA public'],
      [/^CREATE SCHEMA\s+public\b/im, 'CREATE SCHEMA public'],
      [/^ALTER\s+.+\s+OWNER TO\b/im, 'ownership statements'],
      [/^(?:GRANT|REVOKE)\b/im, 'privilege statements'],
      [/^(?:COPY|INSERT INTO)\b/im, 'row-data statements'],
      [/^CREATE\s+(?:OR REPLACE\s+)?FUNCTION\b/im, 'function bodies'],
      [/^(?:BEGIN|COMMIT);?\s*$/im, 'transaction control'],
      [/\btypeorm_migrations\b/i, 'TypeORM migration-ledger references'],
      [
        /set_config\('search_path',\s*''/i,
        'an empty session search_path which would hide the TypeORM ledger',
      ],
      [/^\\/m, 'psql meta-commands'],
    ] as const;

    for (const [pattern, description] of forbidden) {
      if (pattern.test(sql)) {
        throw new Error(
          `Render baseline safety check failed: found ${description}.`,
        );
      }
    }

    if (
      !/^CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;$/m.test(sql)
    ) {
      throw new Error(
        'Render baseline safety check failed: vector extension declaration is missing.',
      );
    }

    return sql;
  }

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      BaselineRenderProductionSchema1788256800000.readSchemaOnlyDump(),
    );
  }

  async down(): Promise<void> {
    throw new Error(
      'The Render production-schema baseline is intentionally non-reversible. ' +
        'Do not destroy an established schema through migration rollback.',
    );
  }
}
