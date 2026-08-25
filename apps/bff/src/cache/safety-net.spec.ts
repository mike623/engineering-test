import type { Cache } from 'cache-manager';
import { SafetyNet } from './safety-net';
import { UpstreamClientError, UpstreamContractError, UpstreamFailureError } from '../upstream/upstream.errors';

const outage = () => new UpstreamFailureError('GET /users', new Error('socket hang up'));

describe('the cache as a safety net', () => {
  let entries: Map<string, unknown>;
  let cache: Cache;

  beforeEach(() => {
    entries = new Map();
    cache = {
      get: jest.fn(async (key: string) => entries.get(key) ?? null),
      set: jest.fn(async (key: string, value: unknown) => {
        entries.set(key, value);

        return value;
      }),
    } as unknown as Cache;
  });

  const build = () => new SafetyNet(cache);

  it('always attempts upstream, even when an entry exists', async () => {
    const fetchFresh = jest.fn().mockResolvedValue('fresh');
    entries.set('users:list', { value: 'stale', cachedAt: Date.now() - 60_000 });

    await expect(build().read('users:list', fetchFresh)).resolves.toMatchObject({
      value: 'fresh',
      state: 'miss',
      ageMs: 0,
    });
    expect(fetchFresh).toHaveBeenCalled();
  });

  it('serves the last known good payload with its true age when upstream fails', async () => {
    entries.set('users:list', { value: 'yesterday', cachedAt: Date.now() - 90_000 });

    const served = await build().read('users:list', jest.fn().mockRejectedValue(outage()));

    expect(served.value).toBe('yesterday');
    expect(served.state).toBe('stale');
    expect(served.ageMs).toBeGreaterThanOrEqual(90_000);
  });

  it('surfaces the failure when there is nothing to fall back to', async () => {
    await expect(
      build().read('users:list', jest.fn().mockRejectedValue(outage())),
    ).rejects.toBeInstanceOf(UpstreamFailureError);
  });

  it('never falls back on a client error, which would resurrect a deleted record', async () => {
    entries.set('parcs:gone', { value: 'deleted parc', cachedAt: Date.now() });

    await expect(
      build().read('parcs:gone', jest.fn().mockRejectedValue(new UpstreamClientError(404, {}))),
    ).rejects.toBeInstanceOf(UpstreamClientError);
  });

  it('never falls back when the response broke its contract, which would hide the break', async () => {
    entries.set('parcs:1', { value: 'good parc', cachedAt: Date.now() });

    await expect(
      build().read('parcs:1', jest.fn().mockRejectedValue(new UpstreamContractError('GET /parcs/:id', 'name'))),
    ).rejects.toBeInstanceOf(UpstreamContractError);
  });

  it('stores only what upstream actually returned, so a bad response cannot poison it', async () => {
    const net = build();
    await net.read('users:list', jest.fn().mockResolvedValue('good'));
    await expect(
      net.read('users:list', jest.fn().mockRejectedValue(new UpstreamContractError('GET /users', 'id'))),
    ).rejects.toBeInstanceOf(UpstreamContractError);

    expect(entries.get('users:list')).toMatchObject({ value: 'good' });
  });

  describe('when the cache itself is down', () => {
    it('degrades to no caching rather than failing the request', async () => {
      cache.set = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(build().read('users:list', jest.fn().mockResolvedValue('fresh'))).resolves.toMatchObject({
        value: 'fresh',
        state: 'miss',
      });
    });

    it('does not let a hanging store hold the request open', async () => {
      cache.set = jest.fn(() => new Promise(() => undefined));

      await expect(build().read('users:list', jest.fn().mockResolvedValue('fresh'))).resolves.toMatchObject({
        value: 'fresh',
        state: 'miss',
      });
    });

    it('surfaces the upstream failure rather than the cache failure', async () => {
      cache.get = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(
        build().read('users:list', jest.fn().mockRejectedValue(outage())),
      ).rejects.toBeInstanceOf(UpstreamFailureError);
    });
  });
});
