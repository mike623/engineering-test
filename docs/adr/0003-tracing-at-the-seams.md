---
status: accepted
---

# Trace the seams, not just the requests

Every interesting failure in this system is one where the status code lies or
the request appears to succeed. Upstream reports a committed write as a 502
(ADR 0001); a read that upstream refused is answered from the cache and
returns 200 (ADR 0002); a request refused by an open breaker never reaches the
network at all. Automatic HTTP instrumentation records none of that
faithfully — it sees a 502 on a write we report as created, a clean 200 on a
request served during an outage, and nothing whatsoever for the breaker.

We therefore run the standard Node auto-instrumentations for HTTP, Express and
Redis, and add spans and attributes at the three seams that own the meaning:
the upstream client, the safety net, and the create path.

## Considered options

- **Logs alone.** Already present, and already sufficient to know a recovered
  write happened. They do not connect it to the request it belongs to: with
  concurrent traffic, "recovered a write" and "serving parcs from cache" are
  two lines that cannot be attributed to the same caller.
- **Automatic instrumentation only.** One dependency, no code, and it records
  the wrong thing where it matters: a `create user` that returns 201 with a
  failed POST inside it looks like a bug rather than the recovery working.
- **Auto-instrumentation plus attributes at the seams.** Chosen.
- **A collector between the BFF and the store.** Rejected at this size. The
  SDK already batches, and a second process to run and configure buys
  buffering we do not need and a failure mode we would have to explain.

## Consequences

- Three attributes carry the semantics the status code cannot:
  `write.outcome` and `write.recovered` on the create span, `cache.state` and
  `cache.age_ms` on whatever read is running, and `error.type` naming which of
  the three upstream errors ended a call — a refusal by an open breaker and a
  timeout are both "failed" and mean different things.
- `error.type` is the class name rather than a message, so it groups. A trace
  search for `BreakerOpenError` answers "how much traffic did we refuse during
  that outage", which no HTTP status can.
- Spans are keyed on the route template, matching the breaker. Keying on the
  resolved path would give `/users/<uuid>` one span name per id.
- Tracing is off unless `OTEL_EXPORTER_OTLP_ENDPOINT` is set. The BFF has to
  run for anyone without a trace store, and an exporter pointed at nothing
  retries in the background indefinitely.
- `startTracing()` runs before every other import in `main.ts`, because the
  instrumentations patch modules as they are required. A module loaded before
  it is silently never traced, which is a failure mode that looks like
  "tracing does not work" rather than an error.
- The exporter batches, so the process flushes on SIGTERM. Without it a
  container stop loses the last few seconds — during an outage, the part worth
  keeping.
- The health endpoint is excluded. The container healthcheck polls it every
  five seconds and would otherwise be most of what is stored.
- The frontend is not instrumented. Its server-side fetches would extend each
  trace back to the page render, and the trace already starts where the
  decisions are made.
- The store is OpenObserve, chosen for being a single binary with an OTLP
  endpoint. Nothing above depends on it: the exporter speaks OTLP, so pointing
  at Jaeger, Tempo or a collector is a change of URL.
