/**
 * AiListingDescriptionService — vision-based description generation
 * Place at: src/ai/ai-listing-description.service.ts
 *
 * Shared by ProductsModule and ClassifiedsModule — neither depends on the
 * other. Given a title + the photo(s) the seller already uploaded, writes
 * one grounded description. Distinct from AiListingService (products-only,
 * text-only, generates a whole listing) — this is the narrower "read the
 * photo and title, write a description" feature both forms actually asked
 * for.
 */
import { Injectable } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiPromptTemplateService } from './ai-prompt-templates.service';

export interface GenerateDescriptionInput {
  title: string;
  imageUrls: string[];
  categoryHint?: string;
}

@Injectable()
export class AiListingDescriptionService {
  constructor(
    private aiService: AiService,
    private prompts: AiPromptTemplateService,
  ) {}

  async generate(input: GenerateDescriptionInput): Promise<{ description: string }> {
    const template = this.prompts.listingDescriptionPrompt();
    const promptLines = [`Title: ${input.title}`];
    if (input.categoryHint) promptLines.push(`Category: ${input.categoryHint}`);
    promptLines.push(`Photos attached: ${input.imageUrls.length}`);

    const result = await this.aiService.generate<{ description: string }>({
      task: 'listing-description',
      prompt: promptLines.join('\n'),
      system: template.system,
      schema: template.schema,
      schemaName: template.schemaName,
      images: input.imageUrls,
    });
    return result.data;
  }
}
