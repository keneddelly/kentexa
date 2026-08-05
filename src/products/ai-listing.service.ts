import { Injectable } from '@nestjs/common';
import { AiCoreService } from '../ai/ai-core.service';
import { AiPromptTemplateService } from '../ai/ai-prompt-templates.service';
import { GenerateListingDto } from './dto/generate-listing.dto';

export interface GeneratedListing {
  name: string;
  description: string;
  category: string;
  subcategory: string;
  features: string[];
}

@Injectable()
export class AiListingService {
  constructor(
    private aiCore: AiCoreService,
    private prompts: AiPromptTemplateService,
  ) {}

  async generateListing(
    input: GenerateListingDto,
    userId: number,
  ): Promise<GeneratedListing> {
    const parts: string[] = [];
    if (input.name) parts.push(`Name so far: ${input.name}`);
    if (input.category) parts.push(`Category hint: ${input.category}`);
    if (input.subcategory) parts.push(`Subcategory hint: ${input.subcategory}`);
    if (input.specs && Object.keys(input.specs).length) {
      parts.push(
        `Known specs: ${Object.entries(input.specs)
          .map(([k, v]) => `${k}: ${v}`)
          .join(', ')}`,
      );
    }
    if (input.hint) parts.push(`Seller notes: ${input.hint}`);

    const user =
      parts.length > 0
        ? parts.join('\n')
        : 'No details provided — the seller has not entered anything yet.';

    return this.aiCore.complete<GeneratedListing>({
      workflow: 'product-listing',
      template: this.prompts.productListingPrompt(),
      user,
      userId,
      effort: 'medium',
    });
  }
}
