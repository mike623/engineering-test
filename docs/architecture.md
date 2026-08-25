# Architecture

C4 model, levels 1 to 3, plus the two decision paths that carry the design.
All diagrams use mermaid `flowchart` syntax.

## Level 1 — System context

```mermaid
flowchart TB
    user["Operations user<br/>browses parcs and bookings,<br/>creates users"]

    subgraph scope["Our scope"]
        system["Booking Console<br/>Next.js web app + Nest BFF"]
    end

    upstream["Eurocamp Engineering API<br/>supplied, left unmodified<br/>injects failures by design"]
    db[("PostgreSQL<br/>eurocamp_api")]

    user -->|"HTTPS"| system
    system -->|"REST over /api/1"| upstream
    upstream -->|"TypeORM"| db
```

The supplied API is treated as a third-party system we do not control and may
not change. Every resilience concern therefore lives on our side of that
boundary.

## Level 2 — Containers

```mermaid
flowchart TB
    user["Operations user"]

    subgraph web["apps/web — Next 16, TypeScript 5"]
        rsc["Server Components<br/>list pages, first paint"]
        island["Client islands<br/>TanStack Query,<br/>retry control, stale banner"]
        eb["Error boundary"]
    end

    subgraph bff["apps/bff — Nest 11, TypeScript 5"]
        ctrl["REST controllers<br/>resource body,<br/>metadata in headers"]
        resil["ResilientHttpClient"]
        cache[("Cache store<br/>payload + cachedAt")]
        health["GET /health/breakers"]
    end

    subgraph supplied["apps/engineering — supplied, unmodified"]
        nest9["Nest 9 API<br/>FlakeyApiInterceptor"]
        pg[("PostgreSQL")]
    end

    user --> rsc
    user --> island
    eb -.->|"catches render failures"| rsc
    rsc -->|"server-side fetch"| ctrl
    island -->|"fetch, retry on demand"| ctrl
    ctrl --> resil
    resil <--> cache
    health --> resil
    resil -->|"axios, retry, breaker"| nest9
    nest9 --> pg
```

Three independent installs. The version table in `NOTES.md` explains why the
web and BFF containers each carry their own manifest rather than joining the
supplied Nx workspace.

## Level 3 — Components inside the BFF

```mermaid
flowchart TB
    subgraph controllers["Controllers"]
        uc["UsersController"]
        bc["BookingsController"]
        hc["HealthController"]
    end

    subgraph services["Application services"]
        us["UserService<br/>pre-check, write, reconcile"]
        bs["BookingService<br/>enrichment composition"]
    end

    subgraph http["ResilientHttpClient"]
        breaker["BreakerRegistry<br/>opossum, keyed by route template"]
        retry["axios-retry<br/>retries: 2, jittered backoff"]
        axios["axios instance<br/>2s per-attempt timeout"]
        validate["ResponseValidator<br/>class-validator DTOs"]
    end

    cache[("CacheService<br/>1h storage, 30s freshness")]
    upstream["Supplied API"]

    uc --> us
    bc --> bs
    hc --> breaker
    us -->|"uncached reads only"| http
    bs --> http
    bs --> cache
    http <--> cache
    breaker --> retry
    retry --> axios
    axios --> upstream
    upstream -.->|"response"| validate
    validate -.-> breaker
```

The nesting order is load-bearing. Because `axios-retry` operates inside the
axios instance, the breaker's action function settles once per exhausted retry
cycle rather than once per attempt. A breaker counting individual attempts
would trip after two requests against a 10%-flaky endpoint and stay open.

`UserService` bypasses the cache entirely, because its reads establish ground
truth about a write rather than display data.

## Read path

```mermaid
flowchart TB
    start(["GET request from web"]) --> kind{"Enrichment lookup<br/>cached within 30s?"}

    kind -->|"yes"| hit["200, X-Cache: hit<br/>upstream not called"]
    kind -->|"no, or a primary read"| bopen{"Breaker open<br/>for this route?"}

    bopen -->|"yes"| fb1{"Cached payload<br/>exists?"}
    fb1 -->|"yes"| stale["200<br/>X-Cache: stale, Age"]
    fb1 -->|"no"| s503["503<br/>Retry-After"]

    bopen -->|"no"| call["axios call<br/>3 attempts, jittered backoff"]

    call -->|"404 or other 4xx"| pass["Passthrough<br/>no cache fallback<br/>breaker untouched"]
    call -->|"2xx"| valid{"Passes DTO<br/>validation?"}
    call -->|"5xx or network,<br/>all attempts failed"| fb2{"Cached payload<br/>exists?"}

    fb2 -->|"yes"| stale
    fb2 -->|"no"| s502["502"]

    valid -->|"every row valid"| store["Store payload with cachedAt<br/>200, X-Cache: miss"]
    valid -->|"some rows dropped"| partial["Store filtered rows<br/>200, X-Dropped-Records"]
    valid -->|"nothing usable"| nostore["Cache left untouched<br/>502"]
```

Primary reads always attempt upstream; the cache answers only on failure. Only
enrichment lookups carry a freshness window, and only validated payloads are
written, so a bad response cannot poison the fallback. A 4xx never falls back
to cache — the resource is gone, and serving a cached copy would resurrect it.

## Write path

```mermaid
flowchart TB
    start(["POST /users"]) --> pre["Pre-check<br/>uncached GET /api/1/users"]

    pre -->|"read failed or<br/>breaker open"| s503["503 Retry-After<br/>no write attempted"]
    pre -->|"address already present"| s409["409<br/>no write attempted"]
    pre -->|"address absent"| write["POST /api/1/users<br/>never retried"]

    write -->|"201"| ok["201"]
    write -->|"502"| rec["Reconcile<br/>uncached GET /api/1/users"]

    rec -->|"address found"| recovered["201<br/>logged as recovered"]
    rec -->|"address absent"| failed["502<br/>WRITE_FAILED"]
    rec -->|"read failed"| unconf["502<br/>WRITE_UNCONFIRMED"]
```

The three terminal states on the right are the rule from ADR 0001. `503` before
any write is safely retryable because state is unchanged; `WRITE_UNCONFIRMED`
after the attempt is not, because the outcome is unknowable.
