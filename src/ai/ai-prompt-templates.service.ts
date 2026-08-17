import { Injectable } from '@nestjs/common';
import { CATEGORY_KEYS } from '../categories/categories.data';

const CATEGORY_LIST = CATEGORY_KEYS.join(', ');

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
        `The category MUST be exactly one of these keys (pick the closest match, never invent ` +
        `a new one): ${CATEGORY_LIST}. The subcategory should be a short, natural label for the ` +
        'specific kind of item within that category (e.g. "smartphones" under "electronics"). ' +
        'Never invent specific technical specs (exact dimensions, capacities, or prices) that ' +
        'were not given — keep those generic if unknown.',
      schema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          category: { type: 'string', enum: CATEGORY_KEYS },
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
        'You parse a natural-language search query for the KenteXa marketplace (Tanzania) ' +
        'into structured filters. Classify which part of the marketplace it belongs to — ' +
        '"product" (a physical item sold by a business/shop), "classified" (a secondhand/' +
        'peer-to-peer item listing), "service" (a bookable service from a provider, e.g. a ' +
        'plumber, tutor, or repair technician), "transport" (moving people or cargo between ' +
        'two cities — a transporter, courier, bus, or truck), "people" (looking up a specific ' +
        'person, seller, or business by their name/username/brand directly — not what they ' +
        'sell, e.g. "kened" or "Bishoo Intelligence Systems"), or "all" if it is ambiguous or ' +
        'could span multiple. Then extract the core keywords to search for, and, only if ' +
        'clearly stated or strongly implied: a category, minimum price, and maximum price ' +
        '(in Tanzanian Shillings); or fromCity and toCity for transport queries — expand common ' +
        'shorthand to the full city name (e.g. "Dar" → "Dar es Salaam"). Omit fields that are ' +
        'not present in the query rather than guessing.\n\n' +
        `For "product" or "classified" queries, category MUST be exactly one of these keys ` +
        `if you set it at all (pick the closest match, or omit it if nothing fits): ` +
        `${CATEGORY_LIST}. For "service" or "transport" queries, always omit category — those ` +
        'parts of the marketplace use a different classification and category here would be ' +
        'meaningless.',
      schema: {
        type: 'object',
        properties: {
          domain: {
            type: 'string',
            enum: ['product', 'classified', 'service', 'transport', 'people', 'all'],
          },
          keywords: { type: 'string' },
          category: { type: ['string', 'null'] },
          minPrice: { type: ['number', 'null'] },
          maxPrice: { type: ['number', 'null'] },
          fromCity: { type: ['string', 'null'] },
          toCity: { type: ['string', 'null'] },
        },
        required: ['domain', 'keywords'],
        additionalProperties: false,
      },
      schemaName: 'search_query_parse',
    };
  }

  // Distinct job from searchParsePrompt() above: that one decides WHERE to
  // search, before any results exist. This one runs AFTER results come
  // back and explains what was actually found — the conversational layer
  // Kentexa's search was missing entirely (routing results into a grid is
  // not the same as an AI that talks about them).
  searchExplainPrompt(): PromptTemplate {
    return {
      system:
        'You are Kentexa\'s shopping assistant for Tanzania. You are given a user\'s search ' +
        'query and a compact summary of what the search actually found (counts per category, ' +
        'and a short list of the top matching items/businesses/people with name, price, and ' +
        'rating where available). Write a short, warm, natural-language response (1-2 sentences, ' +
        'like a helpful person, not a robot) that tells the user what was found — mention a ' +
        'specific standout item or business by name when one exists, and note price range or ' +
        'rating only if it adds real value. If nothing or very little was found, say so honestly ' +
        'and encourage a broader search rather than inventing results. Never claim an item exists ' +
        'that is not in the provided summary. Then suggest up to 3 short, concrete follow-up ' +
        'search queries (each under 6 words, phrased as something the user could type or tap — ' +
        'e.g. "cheaper hidden cameras", "search Mwanza too") that are genuinely useful given what ' +
        'was and wasn\'t found — omit suggestions entirely if none would help. Respond in the same ' +
        'language the query was written in.',
      schema: {
        type: 'object',
        properties: {
          summary: { type: 'string' },
          suggestions: {
            type: 'array',
            items: { type: 'string' },
            maxItems: 3,
          },
        },
        required: ['summary', 'suggestions'],
        additionalProperties: false,
      },
      schemaName: 'search_results_explain',
    };
  }
}
