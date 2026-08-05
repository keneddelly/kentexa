import { Injectable } from '@nestjs/common';
import { AiCoreService } from '../ai-core.service';

// ─────────────────────────────────────────────────────────────────────────
// AI Orchestrator — the only door domain modules use to reach AI Core.
// Each method here is a workflow: decide whether a Core call is even
// needed, shape the prompt, and shape the response for its caller. As
// Search/Seller/Ads/etc. land, they add a method here rather than calling
// AiCoreService directly.
// ─────────────────────────────────────────────────────────────────────────
@Injectable()
export class AiOrchestratorService {
  constructor(private readonly aiCore: AiCoreService) {}

  // AI Support / Marketplace workflow: summarize a product's reviews.
  async summarizeReviews(
    reviewBodies: string[],
    title: string,
  ): Promise<string> {
    if (reviewBodies.length === 0) {
      return `No reviews yet for ${title}. Be the first to share your experience.`;
    }

    const result = await this.aiCore.generate({
      system:
        'You summarize customer product reviews for an e-commerce marketplace. ' +
        'Reply with 2-4 plain sentences covering: overall sentiment, the most-praised ' +
        'aspect, and the most common complaint if any. No headings, no bullet points.',
      prompt:
        `Product: ${title}\n\nReviews:\n` +
        reviewBodies.map((body, i) => `${i + 1}. ${body}`).join('\n'),
      maxTokens: 300,
    });

    return result.text.trim();
  }
}
