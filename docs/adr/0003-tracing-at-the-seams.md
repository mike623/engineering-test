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
- Every response carries `X-Trace-Id`, set by middleware ahead of routing so
  it is present on failures too — the responses anyone actually wants to look
  up. Without it the traces exist and no caller can name the one they mean.
  The header is in `EXPOSED_HEADERS`, or the browser could not read it.
- Inbound `traceparent` is honoured by the SDK's default W3C propagator, so a
  caller that already has a trace id gets the same id back rather than a new
  one, and one trace spans both sides.
- The application logger appends `trace_id` to every line it already writes.
  Logs and traces were otherwise two accounts of the same outage that could
  not be joined: under concurrent traffic, "recovered a write" is true of some
  request and nothing said which.
- The failure *cause* is copied onto our span as `error.cause_code`,
  `error.cause` and, where upstream answered, `upstream.status_code`. Our
  errors say the same thing however they failed — `Upstream call to GET /users
  failed` — because the caller does not act on the difference, but whoever
  reads the trace does: an unresolvable host, a refused connection, our own
  timeout and an injected 502 are four different problems. The auto-
  instrumented child span always held this, so the information was not lost;
  it was one drill-down away and could not be filtered next to
  `upstream.route`. The exception filter logs the same cause for the same
  reason.
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
