# Notes

## Live deployment

<https://130-162-182-197.sslip.io> — the three pages, server-rendered, against
the supplied API and the failures it injects on purpose. Seeded with 20 parcs,
30 users and 10 bookings.

The traces are at <https://traces.130-162-182-197.sslip.io>. Credentials on
request: this repository is public, so they are in an untracked `.env.deploy`
rather than in `docker-compose.apps.yml`, whose committed OpenObserve password
is a local-only default.

It runs on an Oracle always-free `VM.Standard.A1.Flex` — 2 OCPU, 12 GB,
uk-london-1 — as eight containers from the three compose files:

```bash
docker compose --env-file .env.deploy \
               -f docker-compose.yml \
               -f docker-compose.apps.yml \
               -f docker-compose.deploy.yml up -d
```

Only 80 and 443 are reachable. Caddy terminates TLS and proxies inwards, so the
web application, the BFF, the database, Redis, the key browser and the trace UI
publish to the loopback address only — verified from outside, where 3000, 3002,
5080 and 5540 all refuse. The certificates are real Let's Encrypt ones: sslip.io
resolves any name containing a dashed IP address to that address, so two working
names existed before anything was configured, and neither needs a DNS record.

Two things this cost, worth recording rather than hiding.

The x86 always-free shape cannot host this. `VM.Standard.E2.1.Micro` is
burstable from a baseline of one eighth of an OCPU, and building here spends
that budget: `npm ci` for the supplied API took 62 minutes, after which `top`
showed **94% steal** and `docker create` timed out at 100 seconds. Nothing was
broken — the hypervisor had stopped handing over CPU. The ARM shape is not
burstable and showed 0% steal, and the same build took minutes.

Deployment is manual. There is no pipeline: the box clones this repository,
builds, and is updated with `git pull` and a rebuild. For a submission that is
the honest scope; anything more would be pipeline work the exercise did not ask
for.

To remove it entirely:

```bash
oci compute instance terminate --instance-id <ocid> --force
```

## Toolchain version misalignment

The supplied workspace is pinned to a 2023-era toolchain. This constrains where
the frontend can live, so it is recorded here rather than worked around silently.

| Package | Pinned here | Needed by the frontend |
| --- | --- | --- |
| TypeScript | `~4.8.2` | `5.x` (Next 16 and React 19 types) |
| Nx | `15.7.2` | `@nrwl/next` at this version caps Next at 13 |
| NestJS | `^9.0.0` | — |
| Jest | `28.1.1` | 29+ for modern RTL |
| Node | `engines: >=18`, `.nvmrc: 22` | consistent with 22 |

Consequences:

- `@nrwl/next@15.7.2` would pin the frontend to Next 13 and React 18. The App
  Router, React Server Components and Server Actions all assume newer versions
  than this workspace can resolve.
- `tsconfig.base.json` targets `es2015` with `module: esnext` and
  `experimentalDecorators`, tuned for Nest. Extending it from a Next app would
  drag decorator metadata and an ES2015 target into the frontend build.
- Upgrading the workspace to make one shared install work would mean changing
  the supplied API project, which is explicitly out of scope (see below).

Decision: the Next app lives in its own directory with its own `package.json`
and lockfile, and the supplied Nest workspace is left exactly as delivered. Two
installs, two dev commands, no version conflict. Run instructions are in the
README.

## Supply chain observation

`faker@6.6.6` is listed in `dependencies` but is not imported anywhere in
`apps/`, `libs/` or `tools/`. Version `6.6.6` is the sabotaged release published
during the January 2022 maintainer protest; the maintained successor is
`@faker-js/faker`. The seed factories already use `uuid` and template strings
instead, so the dependency is dead weight and should be removed. Left in place
here because the supplied project is not being modified.

## Supplied API — findings, deliberately not fixed

The exercise depends on the API misbehaving, so the supplied code under
`apps/engineering/` is left untouched. Findings are recorded instead of patched.

### 1. `failureRate` is inverted — it is a success rate

`apps/engineering/src/flakey-api.interceptor.ts`:

```ts
if (Math.random() > this.failureRate) { throw new BadGatewayException(); }
```

`new FlakeyApiInterceptor(0.9)` fails roughly 10% of the time, not 90%. The
constructor parameter should be named `successRate`, or the comparison
inverted. Actual injected failure rates:

| Endpoint | Argument | Approximate failure rate |
| --- | --- | --- |
| `GET /api/1/users` | `0.9` | 10% |
| `POST /api/1/users` | `0.3` | 70% |
| `GET /api/1/bookings` | `0.9` | 10% |
| `GET /api/1/parcs/:id` | `0.7` | 30% |

Every other endpoint is uninstrumented and never fails artificially. Any
resilience work has to target these four or it demonstrates nothing.

### 2. Injected failures fire after the write has committed

The interceptor throws inside `next.handle().pipe(map(...))`, which runs after
the route handler has already resolved. For `POST /api/1/users` this means the
row is committed and *then* a 502 is returned, roughly 70% of the time. The
response carries no information distinguishing "the write failed" from "the
write succeeded and the gateway lied".

This makes a naive retry on that endpoint actively destructive: each retry
creates another user. There is no `Idempotency-Key` support upstream and the
row id is minted server-side inside the controller, so the client cannot
supply a key to make the operation idempotent. See ADR 0001.

### 3. Request validation is wired up but never applied

`ValidationPipe` is registered globally in `libs/server/src/index.ts` with
`whitelist: true`. It has no effect on any endpoint, for two compounding
reasons:

- Controllers declare untyped bodies — `create(@Body() payload)` in both
  `user.controller.ts` and `booking.controller.ts`. With no class metatype,
  Nest's `ValidationPipe` skips validation entirely. `parc.controller.ts` types
  its body as an inline object literal, which erases at runtime to `Object` and
  is skipped for the same reason.
- The request contract classes that *should* be used — `CreateUserContract`,
  `BookingRequestContract`, `ParcRequestContract` — are declared, exported, and
  never referenced by any controller signature. They are dead code.
- Even if they were wired, they carry only `@ApiProperty()` decorators. There
  is not a single `class-validator` decorator anywhere in `apps/engineering/`,
  so there would be no constraints to enforce.

Net effect: any JSON body is accepted and written to the database.

### 4. The published OpenAPI schema is wrong for every list endpoint

All three contract files contain the same self-referential declaration:

```ts
export class AllUserResponseContract {
  @ApiProperty({ isArray: true, type: AllUserResponseContract })
  data!: User[];
}
```

`type` references the class from inside its own definition, where the binding
is still uninitialised, and semantically claims `data` is an array of
`AllUserResponseContract` rather than of `User`. Anything generated from this
spec — a typed client, a mock server, contract tests — inherits the error.

`BookingResponseDto` additionally declares an `@ApiProperty() description?:
string` that exists on neither the `Booking` interface nor the `bookings`
table, so the documentation advertises a field the API never returns.

### 5. `POST /api/1/users` writes twice

```ts
const user = await this.userService.newUser({ id: uuid(), name, email });
const newUser = await this.userService.newUser(user);
```

Two `save()` calls with the same id. TypeORM upserts, so the result is one row,
but the endpoint performs a redundant write on every request. The surrounding
`.catch(err => { throw new Error(err) })` also downgrades a typed Nest
exception into a bare `Error`, which surfaces as an opaque 500.

### 6. `POST /api/1/bookings` returns a 500 for a valid request

`comments` is declared `comments?: string` on `BookingModel` but decorated with
a bare `@Column()`. TypeORM does not infer nullability from the TypeScript
optional marker, so the generated column is `NOT NULL`. `BookingRequestContract`
correctly models `comments` as optional. A request omitting it therefore
violates the constraint and produces an unhandled `QueryFailedError`.

This endpoint has no `FlakeyApiInterceptor`, so unlike the four listed above
this 500 is a genuine defect rather than injected chaos. Worth separating when
reasoning about which failures a client should retry.

### 7. Naming

`ParcService.newUser()` creates a parc.

### 8. The supplied image does not build on Apple Silicon

`apps/engineering/Dockerfile.dev` runs `npm ci` on `node:20-bookworm-slim`,
which reaches `@parcel/watcher@2.0.4` — a version predating that package's
split into per-platform prebuilt binaries. There is no arm64 prebuild in the
tarball, so `node-gyp-build` falls back to compiling from source, and the slim
image carries no Python, make or g++:

```
npm error path /usr/src/app/node_modules/@parcel/watcher
npm error gyp ERR! find Python
```

Step 1 of the original instructions therefore fails outright on any M-series
Mac, before a candidate reaches the exercise at all. It presumably builds on
the x64 machines it was written on.

`docker/eurocamp-api.Dockerfile` is that file with `python3`, `make` and `g++`
added, and `docker-compose.apps.yml` points the service at it, so the documented
command works on either architecture. The supplied file stays as delivered.
Pinning `platform: linux/amd64` to build the original under emulation is the
other obvious fix, and it does not work: podman ignores the platform and builds
for the host anyway, failing identically.

## Database review (Task 1)

The schema delegates all integrity to an application layer that does not check
anything (see finding 3). Specific issues:

- **No foreign keys.** `bookings.user` and `bookings.parc` are plain `varchar`
  columns holding uuid strings with no constraint. `DELETE /api/1/users/:id`
  is not rate-limited or soft, so deleting a user leaves orphaned bookings
  pointing at an id that no longer resolves. This is reproducible in two calls.
- **No indexes.** Neither join column is indexed, so any lookup of bookings by
  user or by parc is a sequential scan.
- **Wrong column types.** Primary keys are `varchar` via `@PrimaryColumn()`
  rather than `uuid`. `bookings.bookingdate` is `varchar`, so `"banana"` is a
  storable booking date; it should be `timestamptz`.
- **No unique constraint on `users.email`.** Nothing prevents duplicate
  accounts, which is also what makes the reconciliation strategy in ADR 0001
  racy rather than exact.
- **`synchronize: true` in `config.ts`.** The schema is inferred from entity
  decorators at boot with no migration history. This is unsafe outside local
  development — a renamed property silently drops and recreates a column.
  `typeorm-generate-migrations` and `typeorm-run-migrations` scripts already
  exist in `package.json` but are unused.
- **No `created_at` / `updated_at` anywhere.** No audit trail, and no way to
  order or reconcile records by write time.
- **Nullability is accidental rather than designed** — see finding 6.

Recommended shape: `uuid` primary keys with a database default, `timestamptz`
for `bookingdate`, foreign keys on `bookings.user` and `bookings.parc` with an
explicit `ON DELETE` policy, indexes on both, a unique index on `users.email`,
timestamp columns on all three tables, and migrations replacing `synchronize`.

## Design decisions

Three independent applications, three installs. The supplied API in
`apps/engineering/` is left exactly as delivered; the BFF and the web app each
carry their own `package.json`. This is deliberate isolation, not an oversight
— see the version table at the top. `opossum` alone rules out sharing the
supplied manifest, since it requires Node 22+ while the workspace declares
`engines: >=18`.

**Topology: Next → Nest BFF → supplied API.** Resilience, response validation
and caching live in exactly one server-side place. The browser never sees an
upstream 502, and the cache is shared across all users rather than being
per-tab. The cost is an extra hop and a second process to run.

**Resilience composition, in order:** per-attempt axios timeout → `axios-retry`
with exponential backoff and jitter → `opossum` circuit breaker → response
validation. The ordering matters: because `axios-retry` operates inside the
axios instance, opossum's action function settles once per *exhausted retry
cycle* rather than once per attempt. A breaker counting individual attempts
would trip after two requests on a 10%-flaky endpoint and stay open forever.

Two opossum settings are load-bearing and non-obvious:

- `timeout: false`. Opossum's own timeout runs independently of the retry cycle
  and would abort mid-cycle — axios owns timeouts per attempt, so there is
  exactly one timeout authority.
- `errorFilter: err => err.response?.status < 500`. A 404 is a legitimate
  answer, not a signal that upstream is unhealthy. Only 5xx, network errors and
  timeouts count toward the breaker.

Breakers are held in a registry keyed on the route *template*
(`GET /parcs/:id`), never the resolved path. Keying on the concrete uuid
would create one breaker per id, each with a sample size of one, none ever
reaching `volumeThreshold`. Writes bypass the registry entirely: an open
breaker on a write means we stop calling an endpoint that is succeeding 30% of
the time, and reconciliation (ADR 0001) already covers that failure mode.

**Server rendering, with no client data-fetching library.** Lists are rendered
in server components with `cache: 'no-store'`, and the only client components
are the two that need client state: the retry control, which has to know
whether a request is in flight, and the create-user form, which has to show
which of the five write outcomes happened. TanStack Query would be earning its
keep if the browser were fetching — caching, deduplication, background
refetching — but here the BFF already owns every one of those concerns, and
duplicating them in the browser would put a second, quieter cache in front of a
cache whose entire purpose is to report honestly how stale it is. The Next
fetch cache is switched off for the same reason. What the frontend keeps is the
part it cannot delegate: making the degraded states legible.

**The cache is a safety net, not a read path.** Every request attempts to reach
upstream; the cache answers only when that attempt fails, returning the last
known good payload with `X-Cache: stale` and an `Age` header so the interface
can show the real age of what it is displaying. Enrichment lookups
are the single exception, carrying a 30s freshness window because reference
data tolerates it. See "Caching strategy" below, and ADR 0002.

**Response validation degrades per shape.** A malformed row in a list is
dropped, logged, and counted in `X-Dropped-Records` — one bad record should
not blank the page. A malformed single resource has nothing to degrade
to and returns a 502. Note that against clean seed data this path rarely fires,
so it is proven by unit tests with a mocked upstream and demonstrated live via
the orphan-booking case (delete a user, then list bookings).

**Booking enrichment is split by entity cardinality.** Bookings return bare
uuids and upstream offers no join or expand parameter. Users are resolved
individually via `GET /api/1/users/:id` — deduplicated before dispatch and
served through the cache — because the user table grows unbounded and fetching
all of it does not scale. Parcs come from a single cached `GET /api/1/parcs`,
because parcs are a bounded reference table and the per-id route is the
flakiest endpoint in the API at 30%.

This is knowingly an N+1 on users. It is bounded by page size, every call is
deduplicated and cached, and it targets a route with no injected failure at
all — whereas N+1 on parcs would have concentrated load on the least reliable
route in the system. With more time the fix is a batch endpoint
(`GET /users?ids=a,b,c`) or DataLoader-style request coalescing.

Unresolvable ids render as "Unknown user" rather than failing the row. This is
deliberately *not* the same condition as `partial`: the booking is valid
against its own schema and nothing was excluded from the list, so only the
enrichment field is absent. The UI branches on the null field itself, not on a
meta flag. This is the path by which orphaned bookings become visible.

## Response metadata in headers

The BFF is a contract owner, not a proxy. It does not forward the upstream
response shape — which is both broken (finding 4) and inconsistent, wrapping
lists in `{ data: [...] }` while returning single resources bare. It normalises
both by returning the resource itself, unwrapped.

Everything the client needs to know *about* a response — how old it is, whether
it came from the failure fallback, whether records were withheld — travels in
headers rather than in a body envelope, because it describes the delivery
rather than the resource.

```http
HTTP/1.1 200 OK
Age: 137
X-Cache: stale
X-Dropped-Records: 2
```

```json
[ { "id": "…", "bookingDate": "…", "user": { "id": "…", "name": "User 7" }, … } ]
```

`Age` is a standard HTTP response header carrying seconds since the payload was
generated at the origin, which is precisely what a staleness banner needs, and
it says so in the specification's own vocabulary rather than one we invented.
`X-Cache` with `hit`, `miss` or `stale` follows the convention every CDN
already emits. (`Warning: 110` would have been the historical spelling for
staleness, but the `Warning` header was deprecated in RFC 9111.)

Choosing headers over an envelope buys several things at once. Consumers get
the resource directly instead of reaching through `.data`, so a generated
client, any data-fetching library and curl all behave naturally. Types stay as `Booking[]`
rather than `Envelope<Booking[]>`. And intermediaries can act on the metadata —
a cache or gateway can read `Age`, whereas it cannot parse a body, which was
one of the objections raised against gateway caching earlier.

Two costs come with it. Custom headers are invisible to browser JavaScript
unless `Access-Control-Expose-Headers` lists them, and server components
fetching server-side would not reveal the omission — so a test asserts the
headers are *readable* cross-origin, not merely present. And headers are
strings, so the client parses `X-Dropped-Records` rather than receiving a
number.

Error responses keep a body, as is conventional; that is where
`WRITE_FAILED` and `WRITE_UNCONFIRMED` are carried.

There is deliberately no `recovered` header or field. A recovered write is
recorded in a structured log line and a counter, which is the part worth
defending; no consumer branches on it, and putting it on the wire was an
affordance for demonstrating the mechanism rather than a requirement of it.

Circuit breaker state is likewise absent: `Age` and `X-Cache` already tell the
client what it needs, and breaker states are exposed on `GET /health/breakers`,
which is the better place to watch them change during a demonstration.

## Caching strategy

The cache is a safety net, not a read path. Every request attempts to reach
upstream; the cache answers only when that attempt fails. This is a deliberate
reversal of the usual arrangement and it earns three things.

It removes a bug class. An earlier design served primary reads from a 30s
window, which meant the reconciliation read after a failed write could observe
a cached list predating that write and report `WRITE_FAILED` for a write that
had in fact succeeded. If the cache is never on the success path, that class of
error cannot occur.

It makes `stale` unambiguous. Under a freshness window there are two cache
behaviours and only one is visible: a fresh hit is silent, an expired one is
flagged. With always-fetch, `X-Cache: stale` means exactly one thing —
upstream failed and this is the last known good payload.

And it keeps primary data current. A thirty-second-old booking list is how a
system double-books.

### Freshness by tolerance, not uniformly

The exception is enrichment. Resolving user and parc names on every booking
request would re-fetch reference data that barely changes. So freshness is set
per call site according to how much staleness the data can tolerate:

| Data | Freshness | Rationale |
| --- | --- | --- |
| Bookings, users, parcs as a primary view | 0 — always fetch | Changes on write; the user wants current state |
| `users:<id>` and parcs as enrichment lookups | 30s | A campsite's name does not go stale in thirty seconds |

This is one mechanism, not two. The cache service takes a `freshnessMs`
argument per call site, and `freshnessMs: 0` is the degenerate case where
nothing is ever fresh, so upstream is always called and the cache answers only
on failure.

Pre-check and reconciliation reads take a second flag, `fallbackToCache:
false`. Those two calls establish ground truth about a write, and a cached list
predating the write would give a confidently wrong answer. They must observe
upstream or fail.

### What TTL now means

Because freshness lives in code, TTL no longer expresses how long data is good
for. It answers a narrower question: how old is too old to serve during an
outage. Under healthy operation write-through refreshes the entry on every
success, so TTL never applies. Entry age grows only while upstream is failing,
which makes the emitted `Age` an outage clock — worth exposing alongside
breaker state on `/health/breakers`.

TTL is therefore 24 hours: long enough to read through any outage worth reading
through, short enough to reap abandoned keys. It is a policy dial rather than a
correctness value. Setting it badly makes the fallback more or less useful; it
cannot make the system incorrect. The previous 30s TTL did not have that
property, which is why it was load-bearing and fragile.

Three rules make a long TTL safe:

- **Only validated payloads are stored.** A response failing DTO validation
  must not overwrite the cache, or one bad response poisons the safety net for
  the duration of the outage. Valid payloads are stored; partial ones are
  stored filtered, with their flag; wholly invalid ones leave the previous
  entry untouched.
- **4xx never falls back to cache.** A 404 is a successful answer meaning the
  resource is gone. Falling back would resurrect a deleted record and serve it
  indefinitely. Fallback applies only to 5xx, network errors and an open
  breaker.
- **The stored `cachedAt` is emitted as `Age`**, so the interface renders a real age.
  "Data from yesterday" and "data from two minutes ago" are different messages
  and the user must be able to tell them apart.

### Store

Redis, via `@keyv/redis` under `@nestjs/cache-manager`. The decisive property
is that the last known good payload survives a BFF restart — an in-memory cache
loses it, and a restart during an outage is precisely when it is needed. Redis
also shares the safety net across instances, so a cold instance starts warm.

```ts
CacheModule.registerAsync({
  useFactory: () => ({
    stores: [new Keyv({ store: new KeyvRedis(client), namespace: 'bff' })],
    ttl: 86_400_000,
  }),
})
```

`CacheModule` is used as a store, not as the freshness mechanism. Its TTL
evicts, and an evicted entry cannot be served as a fallback — under a literal
30s TTL the cache would be empty at exactly the moment upstream failed. Keeping
retention long and computing freshness in code separates the two concerns
cleanly. Note that stale-while-revalidate does not address this: it refreshes
proactively as expiry approaches, so when upstream is down the refresh fails and
the entry still expires. It is a latency mechanism, not an availability one.

A Redis failure must never fail a request. `get` that throws is treated as a
miss and `set` that throws is logged and ignored, otherwise a cache outage
becomes an API outage and the cache causes the failures it exists to absorb.
This does introduce a shared fate: Redis down and upstream down together means
a 502 with no fallback.

Throwing is the easy case. The one that actually bites is a cache that neither
answers nor fails: an unreachable Redis queues commands while it reconnects, so
`set` never settles and the request hangs on the optional part of the work. Two
guards, because they cover different failures. The client is created with
`disableOfflineQueue`, so a command issued while disconnected is rejected rather
than queued; and every cache operation runs under a 250ms deadline, which also
covers a Redis that is connected but slow. A cache allowed to be missing must
never be allowed to be slow.

Composed responses are not cached. The enriched bookings payload is assembled
per request from separately cached `bookings`, `users:<id>` and `parcs`
entries. Caching the composition would mean every user modification invalidates
every booking list containing that user.

The supplied `docker-compose.yml` is left untouched, commented-out
`eurocamp-redis` service included; the BFF brings its own compose file.

### Gateway caching, considered and deferred

Caching in front of the BFF — nginx `proxy_cache_use_stale`, or Varnish grace
mode — would serve stale on error without the BFF being involved. It is not a
replacement for the cache described above, for three reasons. It replays the
response verbatim, so a replayed `Age` reflects the moment of caching rather
than the true age of the data and the banner understates it. It can only cache
the composed bookings payload, which is the compound invalidation avoided
above. And it cannot help the enrichment calls, which are where the cost
actually is. It is an additive layer for repeat-request load, not a substitute,
and it demonstrates nothing about upstream failure handling.

## Duplicate handling and reconciliation soundness

Upstream enforces no unique constraint on `users.email`, so a duplicate address
is silently accepted as a second row. More seriously, reconciliation after a
failed write is unsound without knowledge of the pre-state: finding a row with
the submitted address proves nothing if that row may have existed beforehand.
We would report `recovered` and hand back an unrelated record for a write that
genuinely failed.

Each create is therefore preceded by a read:

- Address already present — return `409` and attempt no write. This is the
  genuine conflict case, and the only one where "user already exists" is a
  truthful message.
- Address confirmed absent, write returns 502, reconciliation finds the row —
  the row must be ours, so `201`, logged and counted as a recovered write.

Returning `409` on the recovered path would be actively harmful: the row exists
because our own write succeeded, so telling the caller the address is taken
would prompt them to retry with a different one and create the duplicate we
were attempting to prevent.

Both the pre-check and the reconciliation read bypass the cache. A cached list
predating our own write would report the row absent and produce
`WRITE_FAILED` for a write that succeeded.

The pre-check does not close the time-of-check/time-of-use window — two
concurrent creates of the same address both observe a clean pre-state and both
proceed. No client-side approach closes it. The fix is a unique index upstream.

Two alternatives to this whole path were put to us and rejected; ADR 0001 has
the reasoning under "Why the response stays synchronous". Deferring the write
behind a queue and answering `202` takes the outcome out of the response, which
for account creation means the caller cannot proceed and finds out somewhere
they are not looking. Failing fast on the 502 is worse than it sounds: against
this upstream the failure is usually a lie, so the caller is told a user was
not created when it was, retries, and creates the duplicate. Both assume the
status code can be believed, which is the one thing it cannot be.

### When the pre-check itself fails

The pre-check reads the same 10%-flaky endpoint as everything else and can fail
on its own. Its failure and a reconciliation failure are not symmetric, and the
asymmetry decides the handling.

A failed pre-check means no write has been attempted. State is unchanged, there
is nothing ambiguous to resolve, and the request fails closed with `503` and a
`Retry-After`. The caller may safely retry, which is precisely what cannot be
said of a failed write. A failed reconciliation, by contrast, occurs after the
write has been attempted, leaving an outcome that is unknown and unknowable —
`WRITE_UNCONFIRMED`.

Failing closed is strictly better rather than merely more cautious. If the
pre-check read is failing then the reconciliation read is failing too: same
endpoint, same breaker, same outage. A write attempted under those conditions
is therefore guaranteed to terminate at `WRITE_UNCONFIRMED`. Proceeding gains
nothing and trades a clean, safely retryable `503` for an ambiguous `502` and a
possible orphaned row.

The cost is a genuine one and worth stating plainly: this couples the write
path to the availability of the read path. While the breaker on `GET /users` is
open, every create is refused. The justification is the argument above — those
writes would have been unverifiable regardless, so the system declines to
create ambiguity it could not later resolve. At three attempts against a 10%
failure rate the pre-check fails on the order of once per thousand creates.

An open breaker on the pre-check route is handled identically. A pre-check
response that fails DTO validation is likewise treated as a pre-check failure.

## Failure mapping

Retry and the circuit breaker operate at different scales and must not be
conflated. `retries: 2` means three attempts total, forming one *cycle*, and an
exhausted cycle is a single failure as far as opossum is concerned. The breaker
opens only once the error rate crosses threshold across a rolling window with
`volumeThreshold: 5`, so at minimum five failed cycles. Retry absorbs flake;
the breaker responds to an outage.

An exhausted cycle does not go straight to an error response either. The cache
is consulted first, and an error only reaches the frontend when there is no
last-known-good payload to serve.

| Situation | BFF response |
| --- | --- |
| Upstream 200 | `200`, `X-Cache: miss` |
| Upstream 404 | `404` passthrough; no cache fallback — the resource is gone |
| Upstream 4xx | Passthrough; no cache fallback; breaker untouched |
| Retries exhausted, cached payload exists | `200`, `X-Cache: stale`, `Age` |
| Retries exhausted, nothing cached | `502` — upstream was called and failed |
| Response fails validation entirely | `502`; cache left untouched |
| Breaker open, cached payload exists | `200`, `X-Cache: stale`, `Age` |
| Breaker open, no cache | `503` with `Retry-After` — upstream was never called |
| Breaker open, `?retry=true` from a person | One probe is sent; success closes the breaker |
| Breaker open, `?retry=true` inside the probe window | Refused as above; nothing sent |
| Enrichment lookup fails or is refused | Row renders with the name as `null` |
| Pre-check finds address already present | `409`, no write attempted |
| Pre-check read fails, or its breaker is open | `503` with `Retry-After`, no write attempted |
| Write failed, reconciliation found row | `201`; logged and counted as recovered |
| Write failed, row confirmed absent | `502`, `code: WRITE_FAILED` |
| Write failed, reconciliation read failed | `502`, `code: WRITE_UNCONFIRMED` |

The final two rows are the three-outcome rule from ADR 0001. They share a
status but differ by code, because the frontend should tell the user "we could
not confirm whether this was created — check the user list" rather than
"failed". Reporting a definite failure for an operation that succeeds roughly
30% of the time is the one message certain to be wrong.

Upstream error bodies are never forwarded; the BFF returns its own error shape.

Retry parameters are tuned for user-facing latency rather than for maximum
resilience. Three attempts at a 2s per-attempt timeout with 200ms/500ms jittered
backoff caps a failing read at roughly 7s. Against the 10% failure rate of the
endpoints actually called, that leaves a residual failure probability near
1e-3, and serving stale makes even that case benign. Four attempts would reach
1e-4 at the cost of a 14s spinner, which is the wrong trade for a page load.

## Tracing

Every failure worth investigating here is one where the status code misleads.
Upstream reports a committed write as a 502; a read it refused is answered
from the cache with a 200; a request refused by an open breaker never reaches
the network. Automatic instrumentation records all three wrongly, so the BFF
adds spans and attributes at the seams that own the meaning. ADR 0003 has the
reasoning; what it buys is best shown by one trace of a single create:

```
POST /users                          201
  create user                        write.outcome=created  write.recovered=true
    upstream GET /users              200   (pre-check)
    upstream POST /users     ERROR   502   error.type=UpstreamFailureError
    upstream GET /users              200   (reconciliation)
```

The caller got a 201. Upstream said 502. Both are true, and the trace is where
that stops being a contradiction. Across the run that produced it, the store
held five `write.recovered=true` spans against one ordinary create — the 70%
failure rate, visible rather than inferred.

The same store answers the other two: `error_type = 'BreakerOpenError'` counts
what an open breaker refused, and `cache_state = 'stale'` counts reads served
during an outage that returned 200 and are otherwise indistinguishable from
healthy ones.

Our upstream errors deliberately carry one message whatever went wrong, since
the caller does not act on the difference. A reader does, so the cause is
copied onto the span as `error_cause_code` and `error_cause`:

```
upstream GET /parcs   error_type=UpstreamFailureError
                      error_cause_code=ECONNABORTED
                      error_cause=timeout of 2000ms exceeded
```

`ENOTFOUND` is DNS, `ECONNREFUSED` is nothing listening, `ECONNABORTED` is our
own timeout, and `upstream_status_code` means it answered badly rather than
not at all. None of those is the injected flakiness, which arrives as a 502 or
a 500 from a host that resolved and answered — worth being able to tell apart
when the question is whether an outage is the exercise misbehaving or the
environment.

Finding that trace requires being handed its id, so every response carries
`X-Trace-Id` — set by middleware before routing, which is what puts it on the
failures as well as the successes. The same id is appended to every log line
as `trace_id=`, joining the two accounts of an outage that otherwise could not
be joined: under concurrent traffic "Recovered a write upstream reported as
failed" is true of *some* request and nothing said which. A caller that sends
its own `traceparent` keeps its trace id rather than being given a new one.

The frontend is not instrumented, so a trace starts at the BFF rather than at
the page render, and the supplied API is not instrumented either — the trace
ends at our side of that call.

## Breaking it on purpose

The resilience is invisible while everything works, and the injected flakiness
alone will not show it: reads are attempted three times, each failing 10% of
the time, so a read falls back to the cache once in a thousand requests. To see
any of it you have to take upstream away.

Every command below assumes the full stack is up.

### The amber "showing the last data we could fetch" banner

The cache has to hold the key already — it is written only on a successful
read — so warm it first.

```bash
curl -s localhost:3002/users > /dev/null          # warm the fallback
docker compose -f docker-compose.yml -f docker-compose.apps.yml stop eurocamp-api
open http://localhost:3000/users                  # banner, with an age and a reference
```

Put it back with `up -d --force-recreate eurocamp-api`, **not** `start`. Under
podman a stopped container comes back with no IP and no network alias, so the
BFF cannot resolve `eurocamp-api` and the page stays stale — looking exactly
like a bug in the fallback rather than a quirk of the runtime. Docker Desktop
keeps the alias and `start` is fine there.

### The error page

Same thing without warming the cache, or against a key never read before:

```bash
docker compose -f docker-compose.yml -f docker-compose.apps.yml stop eurocamp-api
curl -i localhost:3002/parcs/99999999-8888-7777-6666-555555555555
```

Upstream is unreachable and there is nothing stored to fall back to, so this is
a genuine 502 and the web application renders the error boundary with a Try
again button. That button is not a reload: it sends `retry=true`, which is the
one caller an open breaker still lets through.

### The breaker opening

With upstream still stopped, make more than five failed calls, then ask:

```bash
for i in $(seq 1 8); do curl -s -o /dev/null localhost:3002/parcs; done
curl -s localhost:3002/health/breakers
```

`GET /parcs` reads `open`. Requests now fail without a network call at all,
which is the point — they are refused in microseconds rather than waiting out
three timeouts. Bring upstream back and the ordinary page stays stale until
either the reset timeout elapses or somebody presses Refresh.

### A recovered write

This one needs nothing broken; upstream breaks it for you.

```bash
curl -s -X POST localhost:3002/users -H 'content-type: application/json' \
  -d '{"name":"Demo","email":"demo-1@example.com"}' -i | head -1
curl -s localhost:3002/health/breakers      # recoveredWrites climbs
```

Roughly seven in ten of those return `201` after upstream reported `502`,
because the row was committed before the failure was injected. The counter is
the honest record of how often it happened.

## Reading a failure in the traces

Every response carries `X-Trace-Id`, including failures, and the web
application prints the same id as `Reference` under the banner and under any
create that did not plainly succeed. That id is the entry point:

```bash
curl -si localhost:3002/parcs | grep -i x-trace-id
```

Open http://localhost:5080/web/traces?stream=default&period=1h&org_identifier=default
— the left nav opens on Logs, not Traces — and search `trace_id='<id>'`.

### What a retry cycle looks like

`axios-retry` makes three attempts inside one call, and each attempt is its own
HTTP span beneath our span for the route. A read against a stopped upstream:

```
GET /parcs/:id                                    ERROR   1.94s
  request handler - /parcs/:id                            1.94s
    upstream GET /parcs/:id                       ERROR   1.94s   error_cause_code=ENOTFOUND
      GET                                         ERROR   9.2ms     attempt 1
      GET                                         ERROR   5.1ms     attempt 2
      GET                                         ERROR   5.2ms     attempt 3
    redis-GET                                             0.8ms   the fallback lookup
```

Counting the children is how you tell a single failure from an exhausted retry
cycle, and the gaps between their start times are the backoff. The nested
`redis-GET` is the safety net being consulted after the last attempt failed.

Useful searches, all of which answer a question the HTTP status cannot:

| Search | Answers |
| --- | --- |
| `write_recovered='true'` | Writes upstream reported as failed that had committed |
| `error_type='BreakerOpenError'` | Requests refused without a network call |
| `cache_state='stale'` | Reads answered from the fallback — these returned 200 |
| `error_cause_code='ENOTFOUND'` | Upstream was not running, as opposed to answering badly |
| `upstream_status_code=502` | Upstream answered, and the answer was the injected failure |

That last distinction is the one worth having. `ENOTFOUND` is DNS,
`ECONNREFUSED` is nothing listening, `ECONNABORTED` is our own timeout, and a
status code means it answered — only the last of those is the exercise
behaving as designed.

Log lines carry the same id as `trace_id=`, so a line from `docker compose logs
bff` and a span in the trace store can be joined:

```
WARN [SafetyNet] Serving users:list from cache, 49508ms old trace_id=5a388423…
```

## What is in the cache

RedisInsight runs at http://localhost:5540 with the BFF's Redis already
registered as "BFF safety net". It answers the question this design raises:
what the fallback actually holds, and how old it is, before an outage starts
rather than during one. Keys are `parcs:list`, `users:list`, `bookings:list`
and one `users:<id>` per name resolved for a booking.

## How this was delivered

Nine slices, each one a complete path through every layer rather than a layer
at a time, so every step of the way there was something that ran and could be
demonstrated. They were tracked as GitHub issues with their blocking edges
recorded, which is also how the ordering below was decided.

| # | Slice | Blocked by |
| --- | --- | --- |
| 1 | Walking skeleton: parcs list end to end | — |
| 2 | Resilient reads: users list survives a flaky endpoint | 1 |
| 3 | Malformed upstream data degrades instead of blanking the page | 2 |
| 4 | Cache as safety net: pages survive upstream going down | 3 |
| 5 | Bookings show who booked what | 4 |
| 6 | Creating a user is safe against a mostly-failing write | 3 |
| 7 | Breaker state is visible and the retry control genuinely retries | 4 |
| 8 | A reviewer can run everything from the README | 1 |
| 9 | Submission polish | 5, 6, 7, 8 |

An earlier draft of this plan was layered by concern — HTTP client, then
validation, then endpoints, then tests, then the frontend — and it was wrong
for the same reason it always is: nothing is demonstrable until the last
layer lands, and the frontend work is what gets cut when time runs out. The
vertical version put the first page on screen in slice one and kept the
failure handling honest, because each slice had to survive being pointed at.

Deployment was scoped out. On a screen-share the interesting states are the
degraded ones, and staging an outage against a local stack is easier to show
and easier to trust than the same thing against a deployed one.

## Testing approach

Tests intercept the network rather than mocking the module in front of it, so
what is asserted is what would actually leave the process. `nock` does that in
the BFF; the web application stubs `fetch` itself, which is the same boundary
in the browser. The intention was `msw` for both halves — its CommonJS build
pulls an ESM-only transitive dependency that Jest cannot `require`, and
converting a suite to ESM to accommodate a test double was a poor trade.

Retry and breaker timing is controlled by configuration — the whole resilience
policy is a plain `UpstreamConfig` object, so a test constructs a client with a
1ms backoff and a volume threshold of 3. No fake timers: they interact badly
with promise scheduling and produce intermittent failures, which is a poor look
in a submission about handling intermittent failures.

54 backend cases and 21 frontend ones. The backend ones worth naming: three
attempts then success; a per-attempt timeout ending a call that never answers;
the breaker opening only after whole retry *cycles* fail, then issuing nothing
at all; a 4xx not counting toward it; writes neither retried nor gated by it; a
forced probe closing the breaker and its rate limit; the safety net refusing to
fall back on a client error; a cache that hangs not holding the request open;
and every one of the five write outcomes, including the write being attempted
at most once.

The frontend ones assert the degraded states, since those are the ones that go
wrong quietly: the error panel and its retry control, the age wording on the
stale banner, the withheld-record count, and the three write outcomes staying
distinguishable — "safe to try again" must never appear on an outcome that was
never confirmed.

## Task 2 — current practice

Rather than list trends, these are the practices this submission actually
relies on, so each one can be pointed at in the code.

### Validation belongs at trust boundaries, at runtime

TypeScript's types are erased at compile time, so a response from an external
service is `any` regardless of the interface it is annotated with. Current
practice is to validate what comes *back* from a boundary, not only what goes
in, and to derive the static type from the schema rather than maintaining the
two separately. Most of the ecosystem has settled on schema-first libraries
such as Zod for this; Nest's decorator idiom means `class-validator` is the
natural fit inside a Nest service, which is what this project uses.

The supplied API is an unusually direct illustration of why this matters. It
registers a global `ValidationPipe`, declares request contract classes, and
then declares its controller bodies untyped — so the pipe has no metatype to
work with and validates nothing. The types say the data is checked. Nothing
checks it.

### Resilience is infrastructure, not error handling

Timeouts, retry budgets and circuit breakers used to be treated as something
each call site handled with its own `try/catch`. The practice now is to
compose them once, in the client, so that policy is uniform and reviewable in
one place. What matters is the composition order rather than the presence of
the parts: because retry sits inside the HTTP client here, the breaker observes
one settled result per exhausted retry cycle rather than one per attempt. A
breaker counting attempts trips on ordinary flake and stays open, which is a
self-inflicted outage built out of resilience components.

The corollary is that retry alone is not resilience. It improves one caller's
odds by adding load at the exact moment the dependency can least absorb it.
The breaker is the part that protects the system rather than the request.

### Caching for availability, not only latency

The interesting use of a cache in a distributed system is not avoiding work; it
is having something to serve when a dependency is unreachable. That inverts the
usual configuration. A conventional TTL evicts, which empties the cache
precisely when the fallback is needed, so retention and freshness have to be
separated: keep entries far longer than they are considered current, and decide
currency in code where the difference between "expired" and "unreachable" is
visible. Degrading to older data with its age shown is almost always better
than an error page, provided the age is shown honestly.

### The server/client boundary is a design decision

React Server Components have made the boundary between server and client
rendering something chosen per view rather than per framework. The current
practice is to be deliberate about it: render on the server for first paint and
for anything that would otherwise ship data-fetching logic to the browser, and
move to the client only where interaction genuinely requires client state. A
retry control needs to know whether a request is in flight and how many times
it has failed, which is client state; a list that renders once is not. Treating
this as a per-component decision rather than picking one model for the whole
application is the change worth noting.

### Write semantics in unreliable systems

Distributed writes need a stated position on what happens when a response is
lost. Retrying a non-idempotent write is a data-integrity bug, not a
resilience feature, and the industry answer is client-supplied idempotency keys
so a retry is recognisable as the same operation. Where a dependency offers no
such key — as here — the fallback is reconciliation: attempt once, then read
back to establish what actually happened, and accept that some outcomes are
genuinely unknown and must be reported as unknown rather than collapsed into
success or failure. The failure mode worth naming is a system that reports a
definite failure for an operation that frequently succeeded.

### Failures that are handled still need to be visible

Absorbing a failure and recording nothing means the failure rate cannot be
observed and cannot be seen to worsen. Structured logs and counters around the
degraded paths — retries exhausted, breaker opened, stale payload served, write
recovered — are what make a resilient system operable rather than merely quiet.
OpenTelemetry has become the default vocabulary for this.

### Tests belong against the boundary, not the module in front of it

A suite that mocks its own HTTP client asserts that the code calls a function.
Intercepting the network instead — `nock` here on the server, a stubbed `fetch`
in the browser — exercises the real client, its retry policy and its
serialisation, so the resilience being claimed is the resilience being tested.
It is the difference between proving the breaker opens and proving a mock was
called three times.

One more, not demonstrated here: schema changes belong in versioned migrations
rather than being inferred from entity metadata at boot. The database review
above makes that case against the supplied `synchronize: true`.

## Running the applications

See [README.md](./README.md) — prerequisites, the four steps, every environment
variable with its default, and a short walkthrough of how to make the degraded
states appear on purpose, since none of them are visible while the API behaves.
