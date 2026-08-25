/**
 * Enrichment lookups — the names hung off a booking — may be this stale before
 * we go back to upstream. Reference data tolerates a few seconds; a primary
 * read does not, and passes no freshness window at all.
 */
export const ENRICHMENT_FRESHNESS_MS = 30_000;
