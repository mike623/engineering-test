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
