import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { EmbeddingService } from '../ai/embedding.service';
import { VectorSchemaService } from './vector-schema.service';

export type SearchEntityType = 'product' | 'classified' | 'service' | 'profile';

export interface SimilarityMatch {
  entityType: SearchEntityType;
  entityId: number;
  score: number; // 1 - cosine distance; 1 = identical, 0 = unrelated
}

// Raw SQL only — search_embeddings is deliberately not a TypeORM entity
// (see vector-schema.service.ts). Every method fails open (no-op / empty
// result) if the table isn't ready or embedding fails, so a semantic-search
// outage never breaks the write path or the rest of search.
@Injectable()
export class SearchIndexService {
  private readonly logger = new Logger(SearchIndexService.name);

  constructor(
    private dataSource: DataSource,
    private embeddings: EmbeddingService,
    private schema: VectorSchemaService,
  ) {}

  async upsert(
    entityType: SearchEntityType,
    entityId: number,
    text: string,
  ): Promise<void> {
    if (!this.schema.ready || !text?.trim()) return;
    try {
      const vector = await this.embeddings.embed(text);
      if (!vector) return;
      await this.dataSource.query(
        `INSERT INTO search_embeddings (entity_type, entity_id, source_text, embedding, updated_at)
         VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (entity_type, entity_id)
         DO UPDATE SET source_text = $3, embedding = $4, updated_at = now()`,
        [entityType, entityId, text.trim(), JSON.stringify(vector)],
      );
    } catch (err) {
      this.logger.warn(
        `Failed to index ${entityType}:${entityId} for semantic search: ${err.message}`,
      );
    }
  }

  async remove(entityType: SearchEntityType, entityId: number): Promise<void> {
    if (!this.schema.ready) return;
    try {
      await this.dataSource.query(
        'DELETE FROM search_embeddings WHERE entity_type = $1 AND entity_id = $2',
        [entityType, entityId],
      );
    } catch (err) {
      this.logger.warn(
        `Failed to remove ${entityType}:${entityId} from semantic index: ${err.message}`,
      );
    }
  }

  async similaritySearch(
    query: string,
    limit = 20,
    minScore = 0.3,
  ): Promise<SimilarityMatch[]> {
    if (!this.schema.ready) return [];
    try {
      const vector = await this.embeddings.embed(query);
      if (!vector) return [];
      const rows: { entity_type: string; entity_id: number; score: string }[] =
        await this.dataSource.query(
          `SELECT entity_type, entity_id, 1 - (embedding <=> $1) AS score
           FROM search_embeddings
           ORDER BY embedding <=> $1
           LIMIT $2`,
          [JSON.stringify(vector), limit],
        );
      return rows
        .map((r) => ({
          entityType: r.entity_type as SearchEntityType,
          entityId: r.entity_id,
          score: Number(r.score),
        }))
        .filter((r) => r.score >= minScore);
    } catch (err) {
      this.logger.warn(`Semantic search query failed: ${err.message}`);
      return [];
    }
  }
}
