import { Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { UpstreamClientError, UpstreamContractError } from '../upstream/upstream.errors';
import { CacheState } from '../http/response-metadata';

export interface ReadOptions {
  /**
   * How recent an entry has to be for us to skip upstream entirely. Zero — the
   * default — means always attempt upstream, which is what a primary read
   * does. Enrichment lookups set a short window because reference data
   * tolerates being a few seconds behind, and a booking list would otherwise
   * mean one upstream call per distinct user on every page load.
   */
  freshnessMs?: number;
}

export interface Served<T> {
  value: T;
  state: CacheState;
  /** How old the payload is. Zero whenever upstream answered. */
  ageMs: number;
}

interface Entry<T> {
  value: T;
  cachedAt: number;
}

/**
 * The cache is allowed to be missing, so it is never allowed to be slow: a
 * store that hangs would turn an optional fallback into a source of latency.
 */
const CACHE_DEADLINE_MS = 250;

const withDeadline = async <T>(operation: Promise<T>, label: string): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;

  // The abandoned operation may still reject later; nothing is listening by
  // then, so keep it from surfacing as an unhandled rejection.
  operation.catch(() => undefined);

  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} exceeded ${CACHE_DEADLINE_MS}ms`)), CACHE_DEADLINE_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
};

/**
 * The cache is a safety net, not a read path. Every request attempts upstream
 * first; the cache answers only when that attempt fails, and says so. See
 * ADR 0002 — the reversal is deliberate and it removes a bug class rather than
 * buying latency.
 */
@Injectable()
export class SafetyNet {
  private readonly logger = new Logger(SafetyNet.name);

  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  async read<T>(
    key: string,
    fetchFresh: () => Promise<T>,
    { freshnessMs = 0 }: ReadOptions = {},
  ): Promise<Served<T>> {
    if (freshnessMs > 0) {
      const entry = await this.recall<T>(key);
      const ageMs = entry ? Date.now() - entry.cachedAt : Infinity;

      if (entry && ageMs < freshnessMs) {
        return { value: entry.value, state: 'hit', ageMs };
      }
    }

    try {
      const value = await fetchFresh();

      // Write-through on every success, so the entry's age is an outage clock:
      // it only grows while upstream is failing.
      await this.remember(key, value);

      return { value, state: 'miss', ageMs: 0 };
    } catch (error) {
      if (!this.isFallbackWorthy(error)) {
        throw error;
      }

      const entry = await this.recall<T>(key);

      if (!entry) {
        throw error;
      }

      this.logger.warn(`Serving ${key} from cache, ${Date.now() - entry.cachedAt}ms old`);

      return { value: entry.value, state: 'stale', ageMs: Date.now() - entry.cachedAt };
    }
  }

  /** How old the fallback for this key is, or null if there is nothing stored. */
  async ageOf(key: string): Promise<number | null> {
    const entry = await this.recall<unknown>(key);

    return entry ? Date.now() - entry.cachedAt : null;
  }

  /**
   * A 4xx is upstream answering, not upstream failing. Falling back would
   * resurrect a deleted record and keep serving it for as long as the entry
   * lives. A response that failed validation is likewise an answer we refuse
   * to pass on, and papering over it with older data would hide a contract
   * break we want to see.
   */
  private isFallbackWorthy(error: unknown): boolean {
    return !(error instanceof UpstreamClientError || error instanceof UpstreamContractError);
  }

  /** A cache outage degrades to no caching. It must never fail a request. */
  private async remember<T>(key: string, value: T): Promise<void> {
    try {
      await withDeadline(
        this.cache.set(key, { value, cachedAt: Date.now() } satisfies Entry<T>),
        `cache write for ${key}`,
      );
    } catch (error) {
      this.logger.error(`Could not write ${key} to the cache`, error);
    }
  }

  private async recall<T>(key: string): Promise<Entry<T> | undefined> {
    try {
      return (await withDeadline(this.cache.get<Entry<T>>(key), `cache read for ${key}`)) ?? undefined;
    } catch (error) {
      this.logger.error(`Could not read ${key} from the cache`, error);

      return undefined;
    }
  }
}
