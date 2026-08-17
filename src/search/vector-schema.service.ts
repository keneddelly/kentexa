import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DataSource } from 'typeorm';

// Bootstraps the pgvector extension + the search_embeddings table ONCE at
// startup. Deliberately NOT a TypeORM @Entity() — with synchronize: true
// (app.module.ts), TypeORM would try to manage this table's schema itself,
// and it has no built-in understanding of Postgres's `vector` column type.
// An unrecognized column type during synchronize could fail loudly enough
// to take the whole backend down over one new feature. Keeping this table
// entirely outside TypeORM's entity system makes that failure mode
// structurally impossible — synchronize never touches it, all access here
// and in SearchIndexService is raw parameterized SQL.
//
// Fails open: if Render's Postgres doesn't permit CREATE EXTENSION, this
// logs clearly and the app boots normally. Semantic search is simply
// unavailable; nothing else in the app is affected.
@Injectable()
export class VectorSchemaService implements OnApplicationBootstrap {
  private readonly logger = new Logger(VectorSchemaService.name);
  private _ready = false;

  constructor(private dataSource: DataSource) {}

  get ready(): boolean {
    return this._ready;
  }

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.dataSource.query('CREATE EXTENSION IF NOT EXISTS vector');
      await this.dataSource.query(`
        CREATE TABLE IF NOT EXISTS search_embeddings (
          id SERIAL PRIMARY KEY,
          entity_type VARCHAR(20) NOT NULL,
          entity_id INTEGER NOT NULL,
          source_text TEXT NOT NULL,
          embedding vector(1536) NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (entity_type, entity_id)
        )
      `);
      this._ready = true;
      this.logger.log('Semantic search ready (pgvector extension + search_embeddings table).');
    } catch (err) {
      this._ready = false;
      this.logger.warn(
        `Semantic search unavailable — could not set up pgvector (${err.message}). ` +
          'Keyword and AI-intent search are unaffected.',
      );
    }
  }
}
