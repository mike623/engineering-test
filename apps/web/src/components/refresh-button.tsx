'use client';

import { useTransition } from 'react';
import { RefreshCw } from 'lucide-react';
import { forceRetry } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * The same forced probe the error page uses, on pages that did render. A page
 * showing stale data has an open breaker in front of it, so a plain reload
 * would be served the same stale copy; only `retry=true` gets through.
 */
export function RefreshButton({ resource, page }: { resource: string; page: string }) {
  const [refreshing, startRefreshing] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={refreshing}
      onClick={() => startRefreshing(() => forceRetry(resource, page))}
    >
      <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
      {refreshing ? 'Refreshing…' : 'Refresh'}
    </Button>
  );
}
