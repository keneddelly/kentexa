import { Injectable, Logger } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiPromptTemplateService } from './ai-prompt-templates.service';

export interface SellerEnrichment {
  keywords: string[];
  useCases: string[];
  impliedCategories: string[];
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
  ) {}

  async enrich(profile: {
    bio?: string | null;
    category?: string | null;
    listingTitles?: string[];
  }): Promise<SellerEnrichment | null> {
    const bio = (profile.bio || '').trim();
    const titles = (profile.listingTitles || []).filter(Boolean).slice(0, 15);
    if (!bio && !profile.category && titles.length === 0) return null;

    const template = this.prompts.sellerProfileEnrichPrompt();
    const payload = JSON.stringify({
      bio,
      category: profile.category || null,
      listingTitles: titles,
    });

    try {
      const result = await this.aiService.generate<SellerEnrichment>({
        task: 'seller-profile-enrich',
        prompt: payload,
        system: template.system,
        schema: template.schema,
        schemaName: template.schemaName,
        cacheKey: `seller-profile-enrich:${payload}`,
      });
      return result.data;
    } catch (err) {
      // Never blocks the profile save this is triggered from.
      this.logger.warn(`Seller profile enrichment failed: ${err.message}`);
      return null;
    }
  }
}
