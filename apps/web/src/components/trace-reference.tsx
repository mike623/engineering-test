/**
 * The BFF's id for the request behind what the user is looking at. Shown only
 * when something went wrong: on a healthy page it is noise, and on a failed
 * one it is the only thing the user can say that leads to the trace of their
 * own request rather than a search through everyone else's.
 */
export function TraceReference({ traceId }: { traceId?: string | null }) {
  if (!traceId) {
    return null;
  }

  return (
    <p className="mt-1 font-mono text-xs text-muted-foreground">Reference {traceId}</p>
  );
}
