import type { ReactNode } from 'react';

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex items-baseline justify-between gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {children ? <p className="text-sm text-muted-foreground">{children}</p> : null}
    </div>
  );
}

/** A count reads as reassurance when a stale notice is sitting above it. */
export function RowCount({ shown, noun }: { shown: number; noun: string }) {
  return (
    <>
      {shown} {shown === 1 ? noun : `${noun}s`}
    </>
  );
}
