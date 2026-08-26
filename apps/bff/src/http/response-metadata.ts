import { Response } from 'express';

export type CacheState = 'miss' | 'hit' | 'stale';

/** The headers the web application is allowed to read across the CORS boundary. */
export const EXPOSED_HEADERS = ['X-Cache', 'X-Dropped-Records', 'Age', 'X-Trace-Id'];

/**
 * Metadata about *how* a response was produced belongs in headers, not in a
 * body envelope: the resource stays the resource, and standard caches and
 * proxies already understand this vocabulary.
 *
 * Set only once a call has succeeded — a failed response has no cache state.
 */
export const reportCacheState = (response: Response, state: CacheState): void => {
  response.setHeader('X-Cache', state);
};

/** `Age` is seconds, per RFC 9111 — the true age of what is being shown. */
export const reportAge = (response: Response, ageMs: number): void => {
  response.setHeader('Age', Math.round(ageMs / 1000));
};

export const reportDropped = (response: Response, dropped: number): void => {
  if (dropped > 0) {
    response.setHeader('X-Dropped-Records', dropped);
  }
};
