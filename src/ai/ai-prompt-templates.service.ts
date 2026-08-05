import { Injectable } from '@nestjs/common';

export interface PromptTemplate {
  system: string;
  schema: Record<string, any>;
  schemaName: string;
}

// Keeps prompt text and response schemas out of controllers/services.
// System text is written stable-first (framing, then task) so it stays
// cacheable across requests via the adapter's cache_control breakpoint.
@Injectable()
export class AiPromptTemplateService {
  moderationPrompt(): PromptTemplate {
    return {
      system:
        'You are a content moderator for KenteXa, a Tanzanian e-commerce marketplace. ' +
        'Review user-submitted comments, questions, and reviews for spam, abuse, harassment, ' +
        'scams, or content unrelated to commerce. Most content is legitimate — only flag or ' +
        'block genuine violations, not merely negative or critical text.',
      schema: {
        type: 'object',
        properties: {
          verdict: { type: 'string', enum: ['clean', 'flagged', 'blocked'] },
          reason: { type: 'string' },
        },
        required: ['verdict', 'reason'],
        additionalProperties: false,
      },
      schemaName: 'moderation_verdict',
    };
  }

  reviewSummaryPrompt(): PromptTemplate {
    return {
      system:
        'You summarize customer reviews for a product or service listing on the KenteXa ' +
        'marketplace. Given a list of review texts, write 2-4 sentences covering overall ' +
        'sentiment, the most-praised aspect, and the most common complaint if any. Be factual ' +
        'and neutral — do not invent details not present in the reviews.',
      schema: {
        type: 'object',
        properties: { summary: { type: 'string' } },
        required: ['summary'],
        additionalProperties: false,
      },
      schemaName: 'review_summary',
    };
  }

  replyDraftPrompt(): PromptTemplate {
    return {
      system:
        'You draft a short, professional reply for a KenteXa seller responding to a customer ' +
        'comment, question, or review. Keep it concise, friendly, and specific to what the ' +
        'customer wrote. This is a draft the seller will review and edit before sending — never ' +
        'assume it will be sent unmodified.',
      schema: {
        type: 'object',
        properties: { draftText: { type: 'string' } },
        required: ['draftText'],
        additionalProperties: false,
      },
      schemaName: 'reply_draft',
    };
  }

  productListingPrompt(): PromptTemplate {
    return {
      system:
        'You help sellers on the KenteXa marketplace (Tanzania) write clear, appealing product ' +
        'listings from partial input. Given whatever the seller has already typed (a name, ' +
        'keywords, or free-text notes), produce a complete listing: a concise product name, a ' +
        'short persuasive description, a category, a subcategory, and 3-5 short feature bullets. ' +
        'Never invent specific technical specs (exact dimensions, capacities, or prices) that ' +
        'were not given — keep those generic if unknown.',
      schema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          category: { type: 'string' },
          subcategory: { type: 'string' },
          features: { type: 'array', items: { type: 'string' } },
        },
        required: ['name', 'description', 'category', 'subcategory', 'features'],
        additionalProperties: false,
      },
      schemaName: 'product_listing',
    };
  }

  searchParsePrompt(): PromptTemplate {
    return {
      system:
        'You parse a natural-language shopping search query for the KenteXa marketplace ' +
        '(Tanzania) into structured filters. Extract the core keywords to search for, and, only ' +
        'if clearly stated or strongly implied, a category, minimum price, and maximum price ' +
        '(in Tanzanian Shillings). Omit fields that are not present in the query rather than ' +
        'guessing.',
      schema: {
        type: 'object',
        properties: {
          keywords: { type: 'string' },
          category: { type: ['string', 'null'] },
          minPrice: { type: ['number', 'null'] },
          maxPrice: { type: ['number', 'null'] },
        },
        required: ['keywords'],
        additionalProperties: false,
      },
      schemaName: 'search_query_parse',
    };
  }
}
