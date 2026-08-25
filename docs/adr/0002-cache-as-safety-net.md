---
status: accepted
---

# The cache is a safety net rather than a read path

Upstream fails by design, so caching here is an availability mechanism rather
than an optimisation — and the conventional arrangement does not deliver it. A
TTL evicts, which leaves the cache empty at precisely the moment upstream
becomes unreachable; and serving primary reads from a freshness window made the
post-failure reconciliation read (ADR 0001) unsound, because it could observe a
cached list predating our own write. We therefore always attempt upstream and
consult the cache only when that attempt fails.

## Considered options

- **Conventional TTL cache.** Rejected: eviction empties the cache exactly when
  the fallback is needed, and raising the TTL to compensate serves stale data
  during healthy operation, which is what the TTL existed to prevent.
- **Long TTL with freshness computed in code.** A necessary half-measure, but on
  its own it still places the cache on the success path and leaves
  reconciliation reading potentially stale data.
- **Always attempt upstream; cache answers only on failure.** Chosen.
- **Gateway-level caching in front of the BFF.** An additive layer for
  repeat-request load, not a substitute — it replays response bodies verbatim so
  a replayed `Age` understates the true age of the data, it can only cache
  composed payloads, and it
  cannot reach the enrichment calls where the cost actually is.

## Consequences

- `X-Cache: stale` carries exactly one meaning: upstream failed and this is
  the last known good payload. There is no silent second cache behaviour.
- The reconciliation failure mode is removed by construction rather than by an
  explicit bypass, because nothing is served from cache on a success path.
- Enrichment lookups keep a 30s freshness window, since re-resolving user and
  parc names on every request would re-fetch reference data that barely
  changes. This is the same mechanism with a different `freshnessMs` argument,
  not a second one; primary reads pass zero.
- TTL no longer expresses how long data is good for. It answers how old is too
  old to serve during an outage, and is set to 24 hours. It is a policy dial:
  choosing badly makes the fallback more or less useful but cannot make the
  system incorrect.
- Entry age grows only while upstream is failing, so the `Age` header emitted
  with a stale response is an outage clock, and is exposed alongside breaker
  state on the health endpoint.
- Only validated payloads are written. A response failing validation leaves the
  previous entry untouched, or one bad response would poison the safety net for
  the duration of the outage.
- A 4xx never falls back to cache. A 404 means the resource is gone; falling
  back would resurrect a deleted record and serve it until the TTL expired.
