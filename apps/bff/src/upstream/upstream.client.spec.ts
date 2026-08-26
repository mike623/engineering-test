import nock from 'nock';
import { BreakerRegistry } from './breaker.registry';
import { UpstreamClient } from './upstream.client';
import { UpstreamConfig } from './upstream.config';
import { createUpstreamHttp } from './upstream.module';
import {
  BreakerOpenError,
  UpstreamClientError,
  UpstreamFailureError,
} from './upstream.errors';

const HOST = 'http://upstream.test';
const PREFIX = '/api/1';

const config: UpstreamConfig = {
  baseUrl: `${HOST}${PREFIX}`,
  timeoutMs: 50,
  retries: 2,
  retryDelayMs: 1,
  breaker: {
    errorThresholdPercentage: 50,
    volumeThreshold: 3,
    resetTimeoutMs: 10_000,
    probeIntervalMs: 5_000,
  },
};

/** Counts what actually left the process, which is the thing under test. */
let attempts = 0;

const registries: BreakerRegistry[] = [];

const registry = () => {
  const created = new BreakerRegistry(config);
  registries.push(created);

  return created;
};

const build = () => new UpstreamClient(createUpstreamHttp(config), registry());

const onEveryRequest = () => {
  attempts += 1;
};

beforeAll(() => {
  nock.disableNetConnect();
});

beforeEach(() => {
  attempts = 0;
});

afterEach(() => {
  nock.abortPendingRequests();
  nock.cleanAll();
  registries.splice(0).forEach((created) => created.onModuleDestroy());
});

afterAll(() => {
  nock.enableNetConnect();
});

describe('reads', () => {
  it('absorbs ordinary flake by retrying', async () => {
    nock(HOST)
      .get(`${PREFIX}/users`)
      .times(2)
      .reply(() => {
        onEveryRequest();

        return [502];
      })
      .get(`${PREFIX}/users`)
      .reply(() => {
        onEveryRequest();

        return [200, { data: [] }];
      });

    await expect(build().get('GET /users', '/users')).resolves.toEqual({ data: [] });
    expect(attempts).toBe(3);
  });

  it('makes exactly the configured number of attempts before giving up', async () => {
    nock(HOST)
      .persist()
      .get(`${PREFIX}/users`)
      .reply(() => {
        onEveryRequest();

        return [502];
      });

    await expect(build().get('GET /users', '/users')).rejects.toBeInstanceOf(UpstreamFailureError);
    expect(attempts).toBe(config.retries + 1);
  });

  it('gives up on an attempt that never answers, rather than hanging', async () => {
    nock(HOST).persist().get(`${PREFIX}/users`).delayConnection(500).reply(200, { data: [] });

    const error = await build()
      .get('GET /users', '/users')
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(UpstreamFailureError);
    // The per-attempt timeout is what ended the call: without it the request
    // would have sat there for the full delay.
    expect((error as UpstreamFailureError).cause).toMatchObject({ code: 'ECONNABORTED' });
  });
});

describe('the circuit breaker', () => {
  const failEvery = (path: string, status = 502) =>
    nock(HOST)
      .persist()
      .get(`${PREFIX}${path}`)
      .reply(() => {
        onEveryRequest();

        return [status];
      });

  it('opens under sustained failure and then stops calling upstream at all', async () => {
    failEvery('/users');
    const client = build();

    // Each exhausted retry cycle is a single failure as far as the breaker is
    // concerned, so it takes `volumeThreshold` cycles to open — not attempts.
    for (let cycle = 0; cycle < config.breaker.volumeThreshold; cycle += 1) {
      await expect(client.get('GET /users', '/users')).rejects.toBeInstanceOf(UpstreamFailureError);
    }

    const attemptsBeforeOpen = attempts;
    expect(attemptsBeforeOpen).toBe(config.breaker.volumeThreshold * (config.retries + 1));

    await expect(client.get('GET /users', '/users')).rejects.toBeInstanceOf(BreakerOpenError);
    expect(attempts).toBe(attemptsBeforeOpen);
  });

  it('is held per route template, so one failing route does not stop another', async () => {
    failEvery('/users');
    nock(HOST).persist().get(`${PREFIX}/parcs`).reply(200, { data: [] });
    const client = build();

    for (let cycle = 0; cycle < config.breaker.volumeThreshold; cycle += 1) {
      await expect(client.get('GET /users', '/users')).rejects.toBeInstanceOf(UpstreamFailureError);
    }

    await expect(client.get('GET /users', '/users')).rejects.toBeInstanceOf(BreakerOpenError);
    await expect(client.get('GET /parcs', '/parcs')).resolves.toEqual({ data: [] });
  });

  it('ignores client errors, which are answers rather than symptoms', async () => {
    failEvery('/users', 404);
    const breakers = registry();
    const client = new UpstreamClient(createUpstreamHttp(config), breakers);

    for (let call = 0; call < config.breaker.volumeThreshold + 1; call += 1) {
      await expect(client.get('GET /users', '/users')).rejects.toBeInstanceOf(UpstreamClientError);
    }

    expect(breakers.states()).toEqual({ 'GET /users': 'closed' });
    // A 404 is not retried either — one attempt per call.
    expect(attempts).toBe(config.breaker.volumeThreshold + 1);
  });
});

describe('a retry the user pressed', () => {
  const failUntil = (recovers: () => boolean) =>
    nock(HOST)
      .persist()
      .get(`${PREFIX}/users`)
      .reply(() => {
        onEveryRequest();

        return recovers() ? [200, { data: [] }] : [502];
      });

  const openTheBreaker = async (client: UpstreamClient) => {
    for (let cycle = 0; cycle < config.breaker.volumeThreshold; cycle += 1) {
      await expect(client.get('GET /users', '/users')).rejects.toBeInstanceOf(UpstreamFailureError);
    }

    await expect(client.get('GET /users', '/users')).rejects.toBeInstanceOf(BreakerOpenError);
  };

  it('probes upstream even while the breaker is open, rather than refusing', async () => {
    let recovered = false;
    failUntil(() => recovered);
    const client = build();
    await openTheBreaker(client);
    recovered = true;

    await expect(client.get('GET /users', '/users', { force: true })).resolves.toEqual({ data: [] });
  });

  it('closes the breaker when the probe succeeds, so ordinary traffic resumes', async () => {
    let recovered = false;
    failUntil(() => recovered);
    const breakers = registry();
    const client = new UpstreamClient(createUpstreamHttp(config), breakers);
    await openTheBreaker(client);
    recovered = true;

    await client.get('GET /users', '/users', { force: true });

    expect(breakers.states()).toEqual({ 'GET /users': 'closed' });
    await expect(client.get('GET /users', '/users')).resolves.toEqual({ data: [] });
  });

  it('leaves the breaker open when the probe fails', async () => {
    failUntil(() => false);
    const breakers = registry();
    const client = new UpstreamClient(createUpstreamHttp(config), breakers);
    await openTheBreaker(client);

    await expect(
      client.get('GET /users', '/users', { force: true }),
    ).rejects.toBeInstanceOf(UpstreamFailureError);
    expect(breakers.states()).toEqual({ 'GET /users': 'open' });
  });

  it('rate limits probes, so holding the button down is not a retry storm', async () => {
    failUntil(() => false);
    const client = build();
    await openTheBreaker(client);

    const attemptsBeforeProbing = attempts;
    await expect(
      client.get('GET /users', '/users', { force: true }),
    ).rejects.toBeInstanceOf(UpstreamFailureError);
    const attemptsAfterOneProbe = attempts;
    expect(attemptsAfterOneProbe).toBeGreaterThan(attemptsBeforeProbing);

    // Pressed again immediately: refused by the breaker, nothing sent.
    for (let press = 0; press < 5; press += 1) {
      await expect(
        client.get('GET /users', '/users', { force: true }),
      ).rejects.toBeInstanceOf(BreakerOpenError);
    }

    expect(attempts).toBe(attemptsAfterOneProbe);
  });
});

describe('writes', () => {
  it('are never retried, because a failed write may still have committed', async () => {
    nock(HOST)
      .persist()
      .post(`${PREFIX}/users`)
      .reply(() => {
        onEveryRequest();

        return [502];
      });

    await expect(
      build().post('POST /users', '/users', { name: 'Ada', email: 'ada@example.com' }),
    ).rejects.toBeInstanceOf(UpstreamFailureError);
    expect(attempts).toBe(1);
  });

  it('bypass the breaker, so an open read breaker does not block them', async () => {
    nock(HOST)
      .persist()
      .get(`${PREFIX}/users`)
      .reply(() => {
        onEveryRequest();

        return [502];
      });
    nock(HOST).persist().post(`${PREFIX}/users`).reply(201, { id: 'u1' });
    const client = build();

    for (let cycle = 0; cycle < config.breaker.volumeThreshold; cycle += 1) {
      await expect(client.get('GET /users', '/users')).rejects.toBeInstanceOf(UpstreamFailureError);
    }
    await expect(client.get('GET /users', '/users')).rejects.toBeInstanceOf(BreakerOpenError);

    await expect(client.post('POST /users', '/users', {})).resolves.toEqual({ id: 'u1' });
  });
});
