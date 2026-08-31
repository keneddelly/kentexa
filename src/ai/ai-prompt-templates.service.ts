import { Injectable } from '@nestjs/common';
import { CATEGORIES, CATEGORY_KEYS } from '../categories/categories.data';

const CATEGORY_LIST = CATEGORY_KEYS.join(', ');

// Compact "key: subkey/subkey/..." listing for every category — lets the
// classifier prefer a REAL subcategory key over inventing a plausible-
// looking one, without needing a per-category enum (JSON Schema has no
// clean way to make one enum's valid values depend on another field's
// value across every provider this app routes to).
const CATEGORY_SUBCATEGORY_MAP = Object.entries(CATEGORIES)
  .map(([key, def]) => `${key}: ${Object.keys(def.subcategories).join('/')}`)
  .join('; ');

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

  // Lighter/cheaper sibling of productListingPrompt() above — used to
  // auto-suggest just a category+subcategory from a title as the seller
  // types (so they don't have to manually scan all 36 top-level
  // categories), without also generating a name/description/features the
  // caller doesn't need for that. Conservative by design: a listing
  // creator seeing a wrong category costs more trust than "general" would.
  categorySuggestPrompt(): PromptTemplate {
    return {
      system:
        'You classify a listing for the KenteXa marketplace (Tanzania) into the single best-' +
        "fitting category and subcategory, given only its title (and maybe a short extra hint) " +
        "— the seller has not chosen a category yet. Be conservative: if genuinely unsure, prefer " +
        'the "general" category over a confident-sounding wrong guess. ' +
        `The category MUST be exactly one of these keys: ${CATEGORY_LIST}. ` +
        `Each category's real subcategory keys are — ${CATEGORY_SUBCATEGORY_MAP}. ` +
        "Return one of the REAL subcategory keys listed for your chosen category when one clearly " +
        'fits; only invent a short label if truly none do.',
      schema: {
        type: 'object',
        properties: {
          category: { type: 'string', enum: CATEGORY_KEYS },
          subcategory: { type: 'string' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
        required: ['category', 'subcategory', 'confidence'],
        additionalProperties: false,
      },
      schemaName: 'category_suggestion',
    };
  }

  // Distinct from productListingPrompt() above: that one builds a WHOLE
  // listing (name/category/subcategory/features) from typed hints, no
  // image. This one is narrower and vision-based — the seller has already
  // chosen a title and uploaded photo(s); the only job here is to look at
  // the actual photo and write one natural description grounded in what's
  // visible, never inventing specs/claims the photo or title don't
  // support. Shared by both the product and classified posting forms.
  listingDescriptionPrompt(): PromptTemplate {
    return {
      system:
        'You write a short, natural, appealing marketplace listing description for KenteXa ' +
        '(Tanzania) from a seller-uploaded photo and the title they typed. Look at the photo ' +
        'carefully and describe what is actually visible — item type, apparent condition, ' +
        'color, notable features — in 2-4 sentences a buyer would find useful. If a category ' +
        'hint is given, write in a style natural for that category. Never invent specs, ' +
        'measurements, brand names, or claims that are not visibly supported by the photo or ' +
        'stated in the title — if something is not visible or given, simply omit it rather than ' +
        'guessing. Write in the same language as the title (Swahili, English, or a mix).',
      schema: {
        type: 'object',
        properties: { description: { type: 'string' } },
        required: ['description'],
        additionalProperties: false,
      },
      schemaName: 'listing_description',
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
        'two cities — a transporter, courier, bus, or truck), "hub" (finding a Super Agent — ' +
        'a KenteXa parcel hub/agent in a city that receives, holds, and forwards packages, ' +
        'e.g. "super agent Mwanza", "hub near me", "who handles parcels in Dodoma", "send a ' +
        'parcel from Arusha" when no specific transport company is named), "people" (looking ' +
        'up a specific person, seller, or business by their name/username directly — not what ' +
        'they sell, e.g. "kened" or "Bishoo Intelligence Systems"), "business" (the user wants ' +
        'to find businesses/sellers/shops THEMSELVES, usually filtered by a brand they carry ' +
        'or their authorization status, rather than one specific product/classified/service or ' +
        'a specific named identity — e.g. "which shops sell genuine LG products", "authorized ' +
        'Samsung dealers in Mwanza", "who sells LG here", "verified LG sellers near me"; this ' +
        'is different from "people", which names ONE specific identity to look up directly), ' +
        'or "all" if it is ambiguous or could span multiple. Then extract the core keywords to ' +
        'search for, and, only if clearly stated or strongly implied: a category, minimum ' +
        'price, and maximum price (in Tanzanian Shillings); fromCity and toCity for transport ' +
        'queries; or, for any non-transport query (including "hub" and "business"), a generic ' +
        'location (a city/town/neighborhood the user wants results from — for "hub" queries ' +
        'this is the city whose Super Agent they want, for "business" queries this is where ' +
        'they want an authorized business). Also extract a brand/manufacturer name whenever ' +
        'one is clearly mentioned, for ANY domain (not only "business") — e.g. "LG phones in ' +
        'Mwanza" is still domain "product" but should still set brand "LG". Expand common city ' +
        'shorthand to the full name (e.g. "Dar" -> "Dar es Salaam"). Omit fields that are not ' +
        'present in the query rather than guessing.\n\n' +
        'Tanzanian price shorthand — convert these into numeric TZS: "120k" → 120000, ' +
        '"laki moja" → 100000 (laki = hundred-thousand), "elfu hamsini" → 50000 (elfu = ' +
        'thousand), "nusu laki" → 50000. A bare amount with no explicit range word (e.g. ' +
        '"kinasa sauti cha 120k") means a budget ceiling — set maxPrice, not minPrice. ' +
        '"chini ya X" / "under X" → maxPrice only. "zaidi ya X" / "juu ya X" / "above X" → ' +
        'minPrice only. "X mpaka Y" / "kati ya X na Y" / "between X and Y" → both.\n\n' +
        'Location examples (non-transport): "spy camera Keko" → location "Keko". "shop ya ' +
        'spy camera Dar" → location "Dar es Salaam". "kinasa sauti Mwanza" → location ' +
        '"Mwanza". Do not populate location when no place is mentioned.\n\n' +
        `For "product" or "classified" queries, category MUST be exactly one of these keys ` +
        `if you set it at all (pick the closest match, or omit it if nothing fits): ` +
        `${CATEGORY_LIST}. For "service", "transport", "hub", "people", or "business" queries, ` +
        'always omit category — those parts of the marketplace use a different classification ' +
        'and category here would be meaningless.',
      schema: {
        type: 'object',
        properties: {
          domain: {
            type: 'string',
            enum: ['product', 'classified', 'service', 'transport', 'hub', 'people', 'business', 'all'],
          },
          keywords: { type: 'string' },
          category: { type: ['string', 'null'] },
          minPrice: { type: ['number', 'null'] },
          maxPrice: { type: ['number', 'null'] },
          fromCity: { type: ['string', 'null'] },
          toCity: { type: ['string', 'null'] },
          location: { type: ['string', 'null'] },
          brand: { type: ['string', 'null'] },
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
        'was and wasn\'t found — omit suggestions entirely if none would help.\n\n' +
        'LANGUAGE (critical, check this last before responding): first identify the language the ' +
        'user\'s query itself is written in. If the query is in English, your entire response — ' +
        'the summary AND every suggestion — MUST be in English. If the query is in Swahili, respond ' +
        'entirely in Swahili. If it mixes both, mirror whichever language dominates the query. Do ' +
        'NOT default to Swahili just because Kentexa is a Tanzanian marketplace — matching the ' +
        'language the user actually typed in matters more than the marketplace\'s usual language. ' +
        'For example, the query "cheap phones in Dar" is English, so the summary and suggestions ' +
        'must all be in English, even though the item names/cities involved are Tanzanian.',
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

  // Layer 4 (CLAUDE.md's Internal AI Intelligence architecture) — the
  // first real AI reasoning on top of BusinessService.getTodayIntelligence()'s
  // Layer 2 counts (Phase 2). Called AFTER that deterministic report
  // already rendered, same "AI when intelligence is required" posture as
  // searchExplainPrompt() above.
  businessInsightPrompt(): PromptTemplate {
    return {
      system:
        'You are Kentexa\'s business assistant for Tanzania. You are given one business\'s real ' +
        'activity numbers for today — commerce counts (orders, payments completed, pending ' +
        'invoices) and customer-activity counts (profile visits, product views, new followers, ' +
        'reviews) — plus a target language code. Write ONE short, warm insight sentence naming ' +
        'what actually stands out in these numbers (e.g. a lot of profile visits but no orders yet, ' +
        'or a strong day for reviews), and — only if something concrete and genuinely useful applies ' +
        '— ONE short recommendation sentence suggesting a next action; set recommendation to null ' +
        'if nothing specific would help. Sound like a helpful person, not a robot.\n\n' +
        'CRITICAL — never invent activity. Reason ONLY from the numbers actually given. Never ' +
        'mention a specific product, customer, order, or Moment by name or detail — none are ' +
        'provided, so naming one would be fabricated. Never mention "Moments" as a feature at all. ' +
        'If the numbers are all zero or negligible, say so honestly (e.g. "no real activity yet ' +
        'today") instead of manufacturing enthusiasm or a false insight — an honest "insufficient ' +
        'activity" beats an invented one.\n\n' +
        'LANGUAGE: respond entirely in the language given by the language field — "en" is English, ' +
        '"sw" is Swahili, "fr" is French. Do not mix languages and do not explain your language choice.\n\n' +
        'CONFIDENCE: also return a confidence score from 0.0 to 1.0 for your own insight — how much ' +
        'real signal these numbers actually contain. Near-zero or very sparse/ambiguous numbers ' +
        '(e.g. all zeros, or just one or two nonzero counts) should score low (0.1-0.3); numbers with ' +
        'a clear, unambiguous pattern across multiple counts should score higher (0.6-0.9). Never ' +
        'return exactly 1.0 — some uncertainty always remains.',
      schema: {
        type: 'object',
        properties: {
          insight: { type: 'string' },
          recommendation: { type: ['string', 'null'] },
          confidence: { type: 'number' },
        },
        required: ['insight', 'recommendation', 'confidence'],
        additionalProperties: false,
      },
      schemaName: 'business_today_insight',
    };
  }

  // Structures a seller/business's free-text bio + category + listing
  // titles into searchable metadata beyond the raw embedding vector — used
  // both to enrich the embedding text (SearchIndexService) and as a light
  // relevance signal in seller ranking (SellerRankingService).
  sellerProfileEnrichPrompt(): PromptTemplate {
    return {
      system:
        'You extract structured search metadata from a KenteXa (Tanzania marketplace) ' +
        'seller/business profile. Given their bio, declared category, and a sample of their ' +
        'product/listing titles, produce: keywords (5-10 short terms a buyer might actually ' +
        'search for — synonyms, related items, and use-cases, not just words already in the ' +
        'bio verbatim), useCases (2-5 short phrases describing who buys from them and why, ' +
        'e.g. "home security", "gift for a wedding"), and impliedCategories (0-3 category keys ' +
        'this business likely also serves, beyond their declared one, based on what they ' +
        'actually sell). Never invent specific products they do not sell. If input is too thin ' +
        'to infer anything reliably, return empty arrays rather than guessing.\n\n' +
        `impliedCategories, if any, MUST be exactly from these keys: ${CATEGORY_LIST}.`,
      schema: {
        type: 'object',
        properties: {
          keywords: { type: 'array', items: { type: 'string' }, maxItems: 10 },
          useCases: { type: 'array', items: { type: 'string' }, maxItems: 5 },
          impliedCategories: {
            type: 'array',
            items: { type: 'string', enum: CATEGORY_KEYS },
            maxItems: 3,
          },
        },
        required: ['keywords', 'useCases', 'impliedCategories'],
        additionalProperties: false,
      },
      schemaName: 'seller_profile_enrich',
    };
  }
}
