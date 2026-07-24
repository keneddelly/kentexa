/**
 * PriceSuggestionService — AI price suggestions for classifieds
 * Place at: src/classifieds/price-suggestion.service.ts
 *
 * Algorithm:
 * 1. Find similar active listings in same category
 * 2. Filter by condition if specified
 * 3. Calculate percentile ranges (low/fair/good)
 * 4. Return suggested price range + market insights
 *
 * No external AI needed — uses real market data from existing listings.
 */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { Classified } from './entities/classified.entity';

export interface PriceSuggestion {
  suggested:   number;       // our recommended price
  low:         number;       // 25th percentile
  fair:        number;       // median
  high:        number;       // 75th percentile
  sampleSize:  number;       // how many listings used
  currency:    string;
  insights:    string[];     // human-readable tips
  confidence:  'high' | 'medium' | 'low';
}

@Injectable()
export class PriceSuggestionService {
  constructor(
    @InjectRepository(Classified)
    private classifiedRepo: Repository<Classified>,
  ) {}

  async suggest(params: {
    category:    string;
    title?:      string;
    condition?:  string;
    subcategory?: string;
  }): Promise<PriceSuggestion> {
    // Build query for similar listings
    const qb = this.classifiedRepo
      .createQueryBuilder('c')
      .select('c.price', 'price')
      .where("c.status = 'active'")
      .andWhere('c.price > 0')
      .andWhere('LOWER(c.category) = LOWER(:cat)', { cat: params.category });

    if (params.condition) {
      qb.andWhere('LOWER(c.condition) = LOWER(:cond)', { cond: params.condition });
    }
    if (params.subcategory) {
      qb.andWhere('LOWER(c.subcategory) = LOWER(:sub)', { sub: params.subcategory });
    }

    // Title keyword matching for more relevant results
    if (params.title) {
      const keywords = params.title.split(' ')
        .filter(w => w.length > 3)
        .slice(0, 3);
      if (keywords.length > 0) {
        qb.andWhere(
          `(${keywords.map((_, i) => `LOWER(c.title) LIKE LOWER(:kw${i})`).join(' OR ')})`,
          Object.fromEntries(keywords.map((k, i) => [`kw${i}`, `%${k}%`]))
        );
      }
    }

    const rows = await qb.orderBy('c.createdAt', 'DESC').take(100).getRawMany();
    const prices = rows.map((r: any) => Number(r.price)).filter(p => p > 0).sort((a, b) => a - b);

    // If not enough data with title keywords, fallback to category only
    if (prices.length < 5 && params.title) {
      const fallback = await this.classifiedRepo
        .createQueryBuilder('c')
        .select('c.price', 'price')
        .where("c.status = 'active'")
        .andWhere('c.price > 0')
        .andWhere('LOWER(c.category) = LOWER(:cat)', { cat: params.category })
        .orderBy('c.createdAt', 'DESC')
        .take(50)
        .getRawMany();
      const fp = fallback.map((r: any) => Number(r.price)).filter(p => p > 0).sort((a, b) => a - b);
      prices.push(...fp.filter(p => !prices.includes(p)));
      prices.sort((a, b) => a - b);
    }

    if (prices.length === 0) {
      return {
        suggested:  0, low: 0, fair: 0, high: 0,
        sampleSize: 0, currency: 'TZS',
        insights:   ['Hakuna data ya bei kwa kategoria hii bado. Weka bei unayoona inafaa.'],
        confidence: 'low',
      };
    }

    const pct = (arr: number[], p: number) => {
      const idx = Math.floor(arr.length * p / 100);
      return arr[Math.min(idx, arr.length - 1)];
    };

    const low  = Math.round(pct(prices, 25));
    const fair = Math.round(pct(prices, 50));
    const high = Math.round(pct(prices, 75));
    const avg  = Math.round(prices.reduce((s, p) => s + p, 0) / prices.length);

    // Suggested price: between fair and high for good condition, near fair for used
    const suggested = params.condition === 'new'
      ? Math.round((fair + high) / 2)
      : Math.round((low + fair) / 2);

    // Build insights
    const insights: string[] = [];
    const fmt = (n: number) => n.toLocaleString('sw-TZ');

    insights.push(`Bidhaa kama hii zinauzwa kati ya TZS ${fmt(low)} – TZS ${fmt(high)}.`);

    if (params.condition === 'new') {
      insights.push('Bidhaa mpya kawaida zinauzwa kwa bei ya juu kuliko wastani.');
    } else if (params.condition === 'used') {
      insights.push('Bidhaa zilizotumika zinauzwa vizuri bei chini ya wastani wa soko.');
    }

    if (prices.length >= 20) {
      insights.push(`Takwimu zinatoka kwenye matangazo ${prices.length} yenye kufanana.`);
    }

    const competitiveNote = suggested < fair
      ? 'Bei hii itakufanya uuze haraka.'
      : suggested > fair
      ? 'Bei hii ni ya juu — hakikisha bidhaa yako ina ubora wa hali ya juu.'
      : 'Bei hii ipo katikati ya soko — ni nzuri sana.';
    insights.push(competitiveNote);

    return {
      suggested,
      low,
      fair,
      high,
      sampleSize: prices.length,
      currency:   'TZS',
      insights,
      confidence: prices.length >= 20 ? 'high' : prices.length >= 5 ? 'medium' : 'low',
    };
  }

  // Price health check for existing listing
  async checkPrice(classifiedId: number): Promise<{
    status: 'competitive' | 'high' | 'low' | 'unknown';
    message: string;
    suggestion?: PriceSuggestion;
  }> {
    const listing = await this.classifiedRepo.findOne({ where: { id: classifiedId } });
    if (!listing || !listing.price) return { status: 'unknown', message: 'Tangazo halijapatikana' };

    const suggestion = await this.suggest({
      category:   listing.category,
      condition:  (listing as any).condition,
      subcategory: listing.subcategory ?? undefined,
    });

    if (suggestion.sampleSize < 3) {
      return { status: 'unknown', message: 'Data haitoshi kufanya ulinganisho' };
    }

    const price = Number(listing.price);
    if (price < suggestion.low * 0.7) {
      return {
        status: 'low',
        message: `Bei yako (TZS ${price.toLocaleString()}) ni chini sana. Unaweza kuongeza hadi TZS ${suggestion.fair.toLocaleString()}.`,
        suggestion,
      };
    }
    if (price > suggestion.high * 1.3) {
      return {
        status: 'high',
        message: `Bei yako (TZS ${price.toLocaleString()}) ni ya juu sana ikilinganishwa na soko. Fikiria kupunguza hadi TZS ${suggestion.fair.toLocaleString()}.`,
        suggestion,
      };
    }
    return {
      status: 'competitive',
      message: `Bei yako ipo vizuri kwenye soko. Tangazo lako lina nafasi nzuri ya kuonekana.`,
      suggestion,
    };
  }
}