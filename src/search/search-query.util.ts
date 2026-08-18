/**
 * buildMultiTermLikeClause — generic OR-of-LIKE clause builder
 * Place at: src/search/search-query.util.ts
 *
 * The one piece of SQL-building logic every domain's .search() reuses
 * instead of each hand-writing its own "match N terms against M columns"
 * WHERE clause. Takes however many normalized terms
 * (search-term-normalizer.util.ts) came out of a query and however many
 * columns a given entity searches, and generates one parameterized OR
 * chain — never a fixed, hand-typed list of conditions, so the term
 * dictionary can grow without this ever being touched.
 */

export interface MultiTermLikeClause {
  clause: string;
  params: Record<string, string>;
}

export function buildMultiTermLikeClause(
  columns: string[],
  patterns: string[],
  paramPrefix: string,
): MultiTermLikeClause {
  const params: Record<string, string> = {};
  const columnClauses = columns.map((col, ci) => {
    const wordClauses = patterns.map((p, pi) => {
      const key = `${paramPrefix}_${ci}_${pi}`;
      params[key] = p;
      return `${col} LIKE :${key}`;
    });
    return `(${wordClauses.join(' OR ')})`;
  });
  return { clause: `(${columnClauses.join(' OR ')})`, params };
}
