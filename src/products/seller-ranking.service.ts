import { Injectable } from '@nestjs/common';

export interface RankableCandidate {
  id: number;
  createdAt: Date;
  salesCount?: number;
  sellerReputationScore?: number;
  sellerIsVerified?: boolean;
  sellerVerificationTier?: string | null;
}

// Multi-signal ranking for seller listings (products/services), modeled
// directly on CvsService's proven feed blend (src/feed/cvs.service.ts) —
// normalized 0-1 signals combined in application code, no new SQL infra.
// Text-match relevance is retained from whatever query built the candidate
// list (the existing WHERE clause); this only reorders that already-
// relevant set, it never changes which rows are included.
@Injectable()
export class SellerRankingService {
  rank<T extends RankableCandidate>(items: T[]): T[] {
    if (items.length <= 1) return items;

    const now = Date.now();
    const maxSales = Math.max(1, ...items.map((i) => i.salesCount || 0));
    const maxRep = Math.max(1, ...items.map((i) => i.sellerReputationScore || 0));

    const scored = items.map((item) => {
      const ageDays =
        (now - new Date(item.createdAt).getTime()) / (1000 * 60 * 60 * 24);
      const recencyNorm = Math.max(0, 1 - ageDays / 90); // decays to 0 over ~90 days
      const salesNorm = (item.salesCount || 0) / maxSales;
      const repNorm = (item.sellerReputationScore || 0) / maxRep;
      const tierBoost =
        item.sellerVerificationTier === 'verified_business'
          ? 1
          : item.sellerVerificationTier === 'verified_seller'
            ? 0.6
            : 0;
      const verifiedBoost = item.sellerIsVerified ? 1 : 0;

      const score =
        salesNorm * 0.35 +
        repNorm * 0.25 +
        recencyNorm * 0.2 +
        tierBoost * 0.15 +
        verifiedBoost * 0.05;

      return { item, score };
    });

    return scored.sort((a, b) => b.score - a.score).map((s) => s.item);
  }
}
