import type { ReactNode } from 'react';

export function PageHeader({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex items-center justify-between gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <div className="flex items-center gap-4">
        {children ? <p className="text-sm text-muted-foreground">{children}</p> : null}
        {action}
      </div>
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
