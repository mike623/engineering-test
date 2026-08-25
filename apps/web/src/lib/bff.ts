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

const BFF_URL = process.env.BFF_URL ?? 'http://localhost:3002';

/**
 * Freshness is the BFF's decision, not ours — it serves the newest payload it
 * can reach and says so in `X-Cache`. Caching again here would only hide that.
 */
export async function getParcs(): Promise<Parc[]> {
  const response = await fetch(`${BFF_URL}/parcs`, { cache: 'no-store' });

  if (!response.ok) {
    throw new Error(`The BFF responded ${response.status} for /parcs`);
  }

  return response.json();
}

export async function getUsers(): Promise<User[]> {
  const response = await fetch(`${BFF_URL}/users`, { cache: 'no-store' });

  if (!response.ok) {
    throw new Error(`The BFF responded ${response.status} for /users`);
  }

  return response.json();
}
