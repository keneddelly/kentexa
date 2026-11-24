import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AiService } from './ai.service';
import { AiPromptTemplateService } from './ai-prompt-templates.service';

export interface SellerEnrichment {
  keywords: string[];
  useCases: string[];
  impliedCategories: string[];
  topicMatches: string[];
}

// Single-shot enrichment, same pattern as AiSearchExplainerService — no
// tool-calling, no multi-turn state. Triggered from the same points that
// already trigger the embedding rebuild (CommerceProfilesService), never
// on every search request.
@Injectable()
export class AiSellerEnrichmentService {
  private readonly logger = new Logger(AiSellerEnrichmentService.name);

  constructor(
    private aiService: AiService,
    private prompts: AiPromptTemplateService,
    private dataSource: DataSource,
  ) {}

  async enrich(profile: {
    bio?: string | null;
    category?: string | null;
    listingTitles?: string[];
    displayName?: string | null;
    imageUrl?: string | null;
  }): Promise<SellerEnrichment | null> {
    const bio = (profile.bio || '').trim();
    const titles = (profile.listingTitles || []).filter(Boolean).slice(0, 15);
    if (!bio && !profile.category && titles.length === 0 && !profile.displayName) return null;

    const activeTopics: Array<{ key: string; label: string; note: string | null; description?: string | null }> =
      await this.dataSource.query(`SELECT key, label, note, description FROM public.feed_topic WHERE active = true ORDER BY position, key`).catch(async () =>
        this.dataSource.query(`SELECT key, label, note FROM public.feed_topic WHERE active = true ORDER BY position, key`).catch(() => []));
    const template = this.prompts.sellerProfileEnrichPrompt(activeTopics);
    const payload = JSON.stringify({
      businessName: profile.displayName || null,
      bio,
      category: profile.category || null,
      listingTitles: titles,
      imageUrl: profile.imageUrl || null,
      activeTopics,
    });

    try {
      const result = await this.aiService.generate<SellerEnrichment>({
        task: 'seller-profile-enrich',
        prompt: payload,
        system: template.system,
        schema: template.schema,
        schemaName: template.schemaName,
        cacheKey: `seller-profile-enrich:${payload}`,
        images: profile.imageUrl ? [profile.imageUrl] : undefined,
      });
      const validTopicKeys = new Set(activeTopics.map((topic) => topic.key));
      return {
        ...result.data,
        topicMatches: Array.isArray(result.data.topicMatches)
          ? [...new Set(result.data.topicMatches.filter((key) => validTopicKeys.has(key)))].slice(0, 8)
          : [],
      };
    } catch (err) {
      // Never blocks the profile save this is triggered from.
      this.logger.warn(`Seller profile enrichment failed: ${err.message}`);
      return null;
    }
  }
}
