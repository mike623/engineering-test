/**
 * @jest-environment node
 *
 * This module only ever runs on the server — it is what the server components
 * call — so it is exercised against Node's own fetch and Response rather than
 * jsdom's approximations.
 */
import { createUser, getUsers } from '../bff';

const respond = (body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) =>
  new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json', ...init.headers },
  });

describe('reading through the BFF', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('never caches on this side, because the BFF already decided what is fresh', async () => {
    fetchMock.mockResolvedValue(respond([]));

    await getUsers();

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/users'), { cache: 'no-store' });
  });

  it('reads how the response was produced from the headers, not the body', async () => {
    fetchMock.mockResolvedValue(
      respond([{ id: 'u1', name: 'Ada', email: 'ada@example.com' }], {
        headers: { 'X-Cache': 'stale', Age: '120', 'X-Dropped-Records': '2' },
      }),
    );

    await expect(getUsers()).resolves.toEqual({
      items: [{ id: 'u1', name: 'Ada', email: 'ada@example.com' }],
      stale: true,
      ageSeconds: 120,
      dropped: 2,
    });
  });

  it('treats a live response as live, with nothing withheld', async () => {
    fetchMock.mockResolvedValue(respond([], { headers: { 'X-Cache': 'miss', Age: '0' } }));

    await expect(getUsers()).resolves.toMatchObject({ stale: false, ageSeconds: 0, dropped: 0 });
  });

  it('throws when the BFF could not answer at all, so the error boundary takes over', async () => {
    fetchMock.mockResolvedValue(respond({ message: 'Upstream request failed' }, { status: 502 }));

    await expect(getUsers()).rejects.toThrow('502');
  });
});

describe('creating a user through the BFF', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it.each([
    ['EMAIL_IN_USE', 409, 'conflict'],
    ['PRECHECK_FAILED', 503, 'retryable'],
    ['WRITE_FAILED', 502, 'failed'],
    ['WRITE_UNCONFIRMED', 502, 'unconfirmed'],
  ])('maps %s onto a distinct outcome', async (code, status, expected) => {
    fetchMock.mockResolvedValue(respond({ code, message: '…' }, { status }));

    await expect(createUser({ name: 'Grace', email: 'grace@example.com' })).resolves.toEqual({
      status: expected,
    });
  });

  it('returns the created user on success', async () => {
    const user = { id: 'b6d1f0a2-9c47-4f3b-8a11-7e5c2d9b0f34', name: 'Grace', email: 'grace@example.com' };
    fetchMock.mockResolvedValue(respond(user, { status: 201 }));

    await expect(createUser({ name: 'Grace', email: 'grace@example.com' })).resolves.toEqual({
      status: 'created',
      user,
    });
  });
});
