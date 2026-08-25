---
status: accepted
---

# Reconcile failed writes instead of retrying them

`POST /api/1/users` upstream throws its injected `BadGatewayException` from
inside `next.handle().pipe(map(...))`, which runs *after* the route handler has
already committed the row. Roughly 70% of successful writes are therefore
reported to us as 502s, and the response carries nothing that distinguishes
"the write failed" from "the write succeeded and the gateway lied". Upstream
reads no `Idempotency-Key` header and mints the row id itself inside the
controller, so we cannot supply a key that would make a retry safe. We
therefore attempt each write exactly once and, on failure, reconcile by reading
back and matching on `email` — rather than retrying, which would create a
duplicate user on roughly seven of every ten requests.

## Considered options

- **Retry with backoff.** The obvious default, and actively destructive here:
  every retry of an apparently-failed write creates another user.
- **Client-supplied idempotency key.** Not available. Upstream ignores the
  header and generates the primary key itself.
- **Reconcile after failure.** Chosen. One write attempt, then a read to
  determine what actually happened.
- **Outbox with an async worker.** The correct answer at this failure rate, and
  rejected only because it requires changing the supplied API, which is out of
  scope. Recorded as the recommendation under "what we would change with more
  time".

## Consequences

- Writes resolve to **three** outcomes, not two. Confirmed-created returns
  success. Confirmed-absent returns a genuine 502 and is not retried. If the
  reconciliation read itself fails after its own retries, the outcome is
  **unknown** and is surfaced as unknown — never coerced into either.
- A recovered write emits a structured log line and increments a counter.
  This is the non-negotiable part: smoothing over a 70% upstream failure rate
  without recording it makes the failure invisible to our own monitoring, so we
  would never notice it degrade further or see reconciliation start failing.
- Nothing about the recovery appears on the wire. A recovered `201` is
  indistinguishable from an ordinary one to the caller. This was reconsidered:
  the provenance argument is real — a normal 201 returns the resource upstream
  confirmed it wrote, whereas a recovered 201 returns a resource located by
  matching `email`, which absent a unique constraint may not be the row we
  wrote — but no consumer branches on the distinction, and a flag kept only to
  make the mechanism visible in a REST client is a demonstration affordance
  rather than a requirement. The log line and counter carry that information to
  the people who act on it.
- Reconciliation is only sound if the pre-state is known. Matching on `email`
  after a failure proves nothing on its own: a row bearing that address may
  have predated the request, in which case we would report `recovered` while
  returning an unrelated record for a write that genuinely failed. Each create
  is therefore preceded by a read. An address already present returns `409`
  and no write is attempted; an address confirmed absent means a subsequent
  match must be our own row.
- The pre-check read and the reconciliation read both **bypass the cache**. A
  cached list predating our own write would cause reconciliation to conclude
  the row is absent and report `WRITE_FAILED` for a write that succeeded —
  reintroducing precisely the failure this decision exists to prevent.
- A failed pre-check and a failed reconciliation are not symmetric. The former
  precedes any write, so state is unchanged and the request fails closed with
  `503`, safely retryable. The latter follows the write and is irreducibly
  ambiguous. Failing closed is strictly better than proceeding: a failing
  pre-check read implies the reconciliation read will fail too, so any write
  attempted then is guaranteed to end at `WRITE_UNCONFIRMED`. This does couple
  write availability to read availability, which is accepted deliberately.
- The pre-check does not close the time-of-check/time-of-use race. Two
  concurrent creates of the same address both observe a clean pre-state, both
  write, and both succeed. No client-side approach can close it; the fix is a
  unique index upstream, which we do not control.
- `axios-retry`'s default `retryCondition` (`isNetworkOrIdempotentRequestError`)
  already excludes POST, so this policy is enforced by the library's default
  rather than by a special case we have to remember.
- Reads are unaffected and retry freely.
