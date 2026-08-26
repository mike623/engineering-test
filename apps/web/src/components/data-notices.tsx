import { AlertTriangle, Info } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { TraceReference } from '@/components/trace-reference';
import { formatAge } from '@/lib/format-age';

// role="status" rather than the component's default "alert": neither notice is
// an error the user must act on, and a polite live region does not interrupt.
export function StaleNotice({
  stale,
  ageSeconds,
  traceId,
}: {
  stale: boolean;
  ageSeconds: number;
  traceId?: string | null;
}) {
  if (!stale) {
    return null;
  }

  return (
    <Alert role="status" className="mb-4 border-amber-500/40 bg-amber-50 text-amber-900">
      <AlertTriangle className="size-4" />
      <AlertTitle>Showing the last data we could fetch</AlertTitle>
      <AlertDescription className="text-amber-900/80">
        The live service is unavailable, so this is the last data we could fetch,
        from {formatAge(ageSeconds)}.
        <TraceReference traceId={traceId} />
      </AlertDescription>
    </Alert>
  );
}

export function IncompleteNotice({ dropped }: { dropped: number }) {
  if (dropped === 0) {
    return null;
  }

  return (
    <Alert role="status" className="mb-4">
      <Info className="size-4" />
      <AlertDescription>
        {dropped === 1
          ? '1 record is not shown because it arrived incomplete.'
          : `${dropped} records are not shown because they arrived incomplete.`}
      </AlertDescription>
    </Alert>
  );
}
