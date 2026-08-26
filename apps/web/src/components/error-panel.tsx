'use client';

import { useTransition } from 'react';
import { AlertTriangle } from 'lucide-react';
import { forceRetry } from '@/app/actions';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/page-header';

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
    <main className="mx-auto max-w-4xl">
      <PageHeader title="Something went wrong" />
      <Alert variant="destructive" className="mb-4">
        <AlertTriangle className="size-4" />
        <AlertTitle>Nothing to show</AlertTitle>
        <AlertDescription>
          We could not load this page, and there was no earlier copy to fall back to.
        </AlertDescription>
      </Alert>
      <Button
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
      </Button>
    </main>
  );
}
