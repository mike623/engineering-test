export interface Parc {
  id: string;
  name: string;
  description: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
}

export interface Named {
  id: string;
  name: string;
}

export interface Booking {
  id: string;
  bookingDate: string;
  comments?: string;
  /** Null when the reference could not be resolved — a deleted user, say. */
  user: Named | null;
  parc: Named | null;
}

export interface Collection<T> {
  items: T[];
  /** Records the BFF withheld because upstream sent them malformed. */
  dropped: number;
  /** True when the live service could not be reached and this is the fallback. */
  stale: boolean;
  /** Age of the payload in seconds. Zero unless it came from the fallback. */
  ageSeconds: number;
}

const BFF_URL = process.env.BFF_URL ?? 'http://localhost:3002';

/**
 * Freshness is the BFF's decision, not ours — it serves the newest payload it
 * can reach and describes what it did in the response headers. Caching again
 * here would only hide that.
 */
async function getCollection<T>(path: string): Promise<Collection<T>> {
  const response = await fetch(`${BFF_URL}${path}`, { cache: 'no-store' });

  if (!response.ok) {
    throw new Error(`The BFF responded ${response.status} for ${path}`);
  }

  return {
    items: (await response.json()) as T[],
    dropped: Number(response.headers.get('X-Dropped-Records') ?? 0),
    stale: response.headers.get('X-Cache') === 'stale',
    ageSeconds: Number(response.headers.get('Age') ?? 0),
  };
}

export const getParcs = (): Promise<Collection<Parc>> => getCollection<Parc>('/parcs');

export const getUsers = (): Promise<Collection<User>> => getCollection<User>('/users');

export const getBookings = (): Promise<Collection<Booking>> => getCollection<Booking>('/bookings');

export type CreateUserResult =
  | { status: 'created'; user: User }
  | { status: 'conflict' }
  | { status: 'invalid'; message: string }
  /** Nothing was written; trying again is safe. */
  | { status: 'retryable' }
  /** Confirmed not written. */
  | { status: 'failed' }
  /** It may or may not have been written. The user must check before retrying. */
  | { status: 'unconfirmed' };

export async function createUser(payload: {
  name: string;
  email: string;
}): Promise<CreateUserResult> {
  const response = await fetch(`${BFF_URL}/users`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });

  if (response.status === 201) {
    return { status: 'created', user: (await response.json()) as User };
  }

  const body = (await response.json().catch(() => ({}))) as { code?: string; message?: string };

  switch (body.code) {
    case 'EMAIL_IN_USE':
      return { status: 'conflict' };
    case 'PRECHECK_FAILED':
      return { status: 'retryable' };
    case 'WRITE_FAILED':
      return { status: 'failed' };
    case 'WRITE_UNCONFIRMED':
      return { status: 'unconfirmed' };
    default:
      return {
        status: 'invalid',
        message: [body.message].flat().join(', ') || `The BFF responded ${response.status}`,
      };
  }
}
