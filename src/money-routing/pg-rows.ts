/**
 * TypeORM's postgres driver returns `[rows, affectedCount]` for UPDATE/DELETE ... RETURNING
 * but a plain rows array for SELECT/INSERT ... RETURNING. Normalise to the rows array.
 */
export function pgRows<T = any>(result: any): T[] {
  if (Array.isArray(result) && result.length === 2 && Array.isArray(result[0]) && typeof result[1] === 'number') {
    return result[0] as T[];
  }
  return result as T[];
}

/** Run a query and always get the rows array (see pgRows). */
export async function qRows<T = any>(runner: { query: (sql: string, params?: any[]) => Promise<any> }, sql: string, params?: any[]): Promise<T[]> {
  return pgRows<T>(await runner.query(sql, params));
}
