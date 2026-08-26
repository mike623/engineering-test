'use client';

import { useTransition } from 'react';
import { forceRetry } from '@/app/actions';

/**
 * Whether a retry is in flight is client state, which is why this half of the
 * page is a client component while the lists around it are not.
 */
export function ErrorPanel({
  resource,
  page,
  reset,
}: {
  resource: string;
  page: string;
  reset: () => void;
}) {
  const [retrying, startRetrying] = useTransition();

  return (
    <main>
      <h1>Something went wrong</h1>
      <p role="alert" className="notice">
        We could not load this page, and there was no earlier copy to fall back to.
      </p>
      <button
        type="button"
        disabled={retrying}
        onClick={() =>
          startRetrying(async () => {
            await forceRetry(resource, page);
            reset();
          })
        }
      >
        {retrying ? 'Retrying…' : 'Try again'}
      </button>
    </main>
  );
}
