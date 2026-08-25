import { formatAge } from '@/lib/format-age';

export function StaleNotice({ stale, ageSeconds }: { stale: boolean; ageSeconds: number }) {
  if (!stale) {
    return null;
  }

  return (
    <p role="status" className="notice notice--stale">
      The live service is unavailable, so this is the last data we could fetch,
      from {formatAge(ageSeconds)}.
    </p>
  );
}

export function IncompleteNotice({ dropped }: { dropped: number }) {
  if (dropped === 0) {
    return null;
  }

  return (
    <p role="status" className="notice">
      {dropped === 1
        ? '1 record is not shown because it arrived incomplete.'
        : `${dropped} records are not shown because they arrived incomplete.`}
    </p>
  );
}
