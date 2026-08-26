'use server';

import { revalidatePath } from 'next/cache';

const BFF_URL = process.env.BFF_URL ?? 'http://localhost:3002';

/**
 * A person pressed retry. That is the one caller an open breaker should still
 * let through, so the request carries `retry=true`; the BFF rate limits those
 * probes so holding the button down cannot become the traffic the breaker
 * opened to prevent.
 */
export async function forceRetry(resource: string, page: string): Promise<void> {
  await fetch(`${BFF_URL}${resource}?retry=true`, { cache: 'no-store' }).catch(() => undefined);

  revalidatePath(page);
}
