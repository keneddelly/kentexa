import { Injectable } from '@nestjs/common';
import { AiService } from '../ai/ai.service';
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
    private aiService: AiService,
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

    const template = this.prompts.productListingPrompt();
    const result = await this.aiService.generate<GeneratedListing>({
      task: 'product-listing',
      prompt: user,
      system: template.system,
      schema: template.schema,
      schemaName: template.schemaName,
      userId,
    });
    return result.data;
  }
}
