'use client';

import { ErrorPanel } from '@/components/error-panel';

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return <ErrorPanel resource="/bookings" page="/bookings" reset={reset} />;
}
