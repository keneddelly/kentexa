import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

// Hand-rolled in-memory TTL cache — no Redis exists anywhere in this
// backend, so this avoids introducing new infrastructure for a
// single-instance deployment.
@Injectable()
export class AiCacheService {
  private readonly store = new Map<string, CacheEntry>();
  private readonly ttlMs: number;

  constructor(private config: ConfigService) {
    this.ttlMs = Number(this.config.get<string>('AI_CACHE_TTL_MS') || 300000);
    setInterval(() => this.sweep(), this.ttlMs).unref();
  }

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt < Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  set(key: string, value: unknown, ttlMs = this.ttlMs): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  private sweep(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (entry.expiresAt < now) this.store.delete(key);
    }
  }
}
