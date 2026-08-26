# Eurocamp engineering test — submission

Three independent applications:

| Directory | What it is | Port |
| --- | --- | --- |
| `apps/engineering` | The supplied API. **Left exactly as delivered**, including the failures it injects on purpose. | 3001 |
| `apps/bff` | Nest BFF. Owns retries, timeouts, the circuit breaker, response validation and the cache. | 3002 |
| `apps/web` | Next frontend. Server-rendered lists, error boundaries, a retry that genuinely retries. | 3000 |

The reasoning — database review, API findings, design decisions, what I would
change with more time — is in [NOTES.md](./NOTES.md). Diagrams are in
[docs/architecture.md](./docs/architecture.md), and the two decisions worth
arguing about have their own records in [docs/adr](./docs/adr).

## Prerequisites

- Docker — for the supplied API, its database, and Redis
- Node 22 (`.nvmrc` pins it; `nvm use` picks it up) and npm 9+
- git

## Running everything

Two ways. Containers are fewer commands; running the applications on the host
is faster to iterate on and is what the development scripts are for.

### Everything in containers

```bash
docker compose -f docker-compose.yml -f docker-compose.apps.yml up --build -d
docker compose -f docker-compose.yml -f docker-compose.apps.yml exec eurocamp-api npm run seed:run
```

Merging both files puts all five services on one network, so they reach each
other by name. Then open http://localhost:3000.

The supplied `docker-compose.yml` and `Dockerfile.dev` are unchanged. The
second file adds Redis, the BFF and the web application, and builds the
supplied API from `docker/eurocamp-api.Dockerfile` — its own Dockerfile does
not build on Apple Silicon at all, and that copy adds the three packages it
is missing. Finding 8 in NOTES.md has the detail.

### Applications on the host

Useful while working on them, and the path that needs no workaround. Steps 1
and 2 are still containers.

**1. The supplied API and its database** — exactly the steps in the original
instructions below:

```bash
docker compose up -d --build --force-recreate
docker compose exec eurocamp-api npm run seed:run
```

The API is then on http://localhost:3001, with its docs at
http://localhost:3001/api.

**2. Redis**, from the compose file belonging to the new applications:

```bash
docker compose -f docker-compose.apps.yml up -d bff-redis
```

Skipping this is survivable: with no `REDIS_URL` set the BFF falls back to an
in-memory store. It loses the safety net across restarts, which is exactly
when it matters, so prefer running it.

**3. The BFF:**

```bash
cd apps/bff
npm install
REDIS_URL=redis://localhost:6379 npm run dev
```

**4. The web application:**

```bash
cd apps/web
npm install
npm run dev
```

Then open http://localhost:3000.

### Traces

The compose stack includes OpenObserve, and the BFF exports OTLP spans to it.
Open http://localhost:5080 and sign in with `root@example.com` /
`Complexpass#123` — development credentials, in the compose file in plain
sight on purpose.

Every response carries the id of its own trace, on success and on failure:

```bash
curl -si localhost:3002/users | grep -i x-trace-id
# X-Trace-Id: db092f9c03303c3fcca5cc29f154d27d
```

Paste that into the trace search and you get the request back, including the
502 from upstream inside the 201 you were handed. Log lines carry the same id
as `trace_id=`, so the two can be joined. Sending your own `traceparent`
header continues your trace rather than starting a new one, and the same id
comes back.

The web application shows the same id as `Reference <id>`, on the stale banner
and on any create that did not plainly succeed — the cases where a user may
have to ask someone what happened. It does not appear on a healthy page. The
browser never talks to the BFF directly, so this is the only way that id
reaches a person: every fetch happens in the Next server process, and the
BFF's headers stop there.

Finding a trace in the UI: the left nav opens on **Logs**, so choose
**Traces**, make sure the stream dropdown says `default`, widen the range to
**Past 1 Hours** and press **Run query** — or go straight to
http://localhost:5080/web/traces?stream=default&period=1h&org_identifier=default.
The OpenObserve container has no volume, so recreating it discards every
trace stored so far.

Traces answer the questions the status codes cannot. Search the `default`
traces stream for:

- `write_recovered = 'true'` — writes upstream reported as failed that had
  actually committed. The span tree shows the 502 from `upstream POST /users`
  inside a `create user` span that returned 201.
- `error_type = 'BreakerOpenError'` — requests refused without reaching the
  network, which no HTTP status distinguishes from a request that failed.
- `cache_state = 'stale'` — reads answered from the safety net during an
  outage. These returned 200, so nothing else marks them.

Tracing is off when `OTEL_EXPORTER_OTLP_ENDPOINT` is unset, which is how the
BFF runs outside compose. See ADR 0003.

### Seeing it fail

The interesting behaviour is invisible while upstream is healthy, and the
injected flakiness will not show it either — reads are retried three times, so
a fallback happens about once in a thousand requests. NOTES.md has a section
called "Breaking it on purpose" with the commands for each state: the stale
banner, the error page, the breaker opening, and a recovered write. The
section after it reads the same failures back out of the traces, including
what a retry cycle looks like.

### What is in the cache

RedisInsight runs at http://localhost:5540 with the BFF's Redis already
registered. Keys are `parcs:list`, `users:list`, `bookings:list` and one
`users:<id>` per name resolved for a booking.

### Ports

`3000` web, `3001` supplied API, `3002` BFF, `5080` OpenObserve, `5433`
Postgres, `5540` RedisInsight, `6379` Redis. The
supplied compose file publishes 5433 and 3001; if either is already taken on
your machine, that bind fails before anything else runs.

### Why three separate installs

The supplied workspace pins TypeScript 4.8, Nx 15, Nest 9 and Jest 28, and
declares `engines: node >=18`. The BFF needs Node 22 (`opossum` requires it)
and the frontend needs React 19 and Next 16, whose types need TypeScript 5.
Upgrading the supplied workspace to accommodate them would mean editing the
thing under test — so the two new applications carry their own manifests and
lockfiles instead, and the supplied one is left as delivered. NOTES.md has the
full version table.

## Tests

```bash
npm --prefix apps/bff test    # resilience, validation, cache, write reconciliation
npm --prefix apps/web test    # error state, retry control, stale and partial rendering
```

Both suites intercept HTTP rather than mocking modules, so what is asserted is
what would actually leave the process.

## Configuration

The BFF reads these; every one has a working default.

| Variable | Default | What it does |
| --- | --- | --- |
| `UPSTREAM_BASE_URL` | `http://localhost:3001/api/1` | The supplied API |
| `UPSTREAM_TIMEOUT_MS` | `2000` | Timeout per attempt, not per retry cycle |
| `UPSTREAM_RETRIES` | `2` | Retries after the first attempt, so three attempts |
| `UPSTREAM_RETRY_DELAY_MS` | `300` | Base for jittered exponential backoff |
| `BREAKER_VOLUME_THRESHOLD` | `5` | Failed retry *cycles* before the breaker may open |
| `BREAKER_ERROR_THRESHOLD_PERCENTAGE` | `50` | Failure rate at which it opens |
| `BREAKER_RESET_TIMEOUT_MS` | `10000` | How long it stays open before probing |
| `BREAKER_PROBE_INTERVAL_MS` | `5000` | Shortest gap between user-forced probes |
| `REDIS_URL` | unset (memory) | Cache store |
| `PORT` | `3002` | BFF port |

The web application reads `BFF_URL`, defaulting to `http://localhost:3002`.

## Seeing the interesting parts

The whole point of the exercise is what happens when the API misbehaves, and
none of that is visible while everything works. Three things worth doing:

**Watch a page survive an outage.** Load http://localhost:3000, then
`docker compose stop eurocamp-api` and reload. The page still renders, with a
banner saying how old the data is. `curl -i localhost:3002/parcs` shows
`X-Cache: stale` and an `Age` header.

**Watch the breaker open and close.** With the API still stopped, reload a few
times, then `curl localhost:3002/health/breakers` — the route is `open`.
Start the API again and reload: still stale, because the breaker has not timed
out yet. Press **Try again** on an error page, or
`curl 'localhost:3002/parcs?retry=true'`, and it probes upstream, closes the
breaker and serves fresh data. Repeat presses inside the probe window send
nothing.

**Watch a write survive an API that lies.** `POST /api/1/users` upstream
commits the row and *then* reports failure, roughly seven times in ten. Create
a few users from the form on http://localhost:3000/users and compare the list
against the BFF log: `Recovered a write upstream reported as failed` appears
for each one the API disowned, and no user is ever created twice.

---

<!-- Everything below is the original instructions, unchanged. -->

# Quick test

## Introduction

Thanks for using this test. We have created a simple api that deploys in a docker container. 
We've devised some small tasks that will help us gauge your fit. 

Please follow the installation instructions carefully and don't spend any more time than allocated in the tasks below, if you run out of time or it is too exhausting please post what you have and we will review it regardless.

## Installation (15 minutes)

### Prerequisites

- docker installed | https://docs.docker.com/get-docker/
- git installed | https://git-scm.com/book/en/v2/Getting-Started-Installing-Git
- WSL2 for windows | https://learn.microsoft.com/en-us/windows/wsl/install
- A database GUI
- NPM | https://docs.npmjs.com/
- Postman | https://www.postman.com/

### Steps

1. Git clone the repository `git clone https://github.com/Eurocamp/engineering-test.git`
2. `cd` into the engineering-test directory
3. run `docker compose up -d --build --force-recreate`
4. run `docker compose exec eurocamp-api npm run seed:run`
5. Check that there is data in the database tables (see below for connection details). Also review the api documentation at http://localhost:3001/api
6. Load the postman collection from the root directory 'Engineering.postman_collection.json' and test the api endpoints

#### Connection details
Credentials for your database GUI 

HOST=localhost
PORT=5433
USER=postgres
PASSWORD=postgres
NAME=eurocamp_api


# Tasks

Your task is to answer some questions and complete the following tasks below - We're looking for solutions that demonstrate passion, effort and knowledge (typescript, caching, testing, state etc.). Send a link with your solution and accompanying notes to engineering@eurocamp.co.uk or your representative. <b>Please note we can't accept zip files containing solutions, please utilise github, dropbox or google drive.</b>

With all tasks - **please add comments, utilise tests and submit clear instructions on running your solution.**

Task 1 & 2 notes along with anything else you want to say can be placed in `NOTES.md`.

Please note: During the technical interview, you will be asked to explain sections of this test, and may be asked to share your screen to demonstrate your code.

## Task 1 (15 minutes)

 - Review the `eurocamp_api` database and make notes on the current structure and state of the database. How would you improve it using relational database best practices? We're mainly interested in how you would improve the database theoretically

## Task 2 (10 minutes)

- Brief explanation of the latest practices in your respective field of expertise.

## Task 3 (1 hour)

:warning: Please note that you should just pick the tasks that fit your specialisation e.g. backend developers should choose `[Backend]` tasks. <i>Do not do all the tasks!</i>

The API at localhost:3001 is what you will communicate with. It has 3 entity collections with various CRUD operations. 

However some of the endpoints do fail sometimes and return exceptions or 500 error responses every so often.

<b>Please note we would appreciate Typescript being used.</b>

### **[Backend Only]**

Create a Node client service that consumes the api (as seen on http://localhost:3001/api) and actions the api endpoints. This service should handle api failures or bad responses. 

An example of a test(s) is expected.


### **[Frontend Only]**

Using your favourite frontend framework please interact with the API and handle potential API failures.


# Thanking you
Please understand we don't expect you too spend too much time on this. We're happy to review whatever you finish at engineering@eurocamp.co.uk
