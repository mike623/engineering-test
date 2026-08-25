import { IncompleteNotice, StaleNotice } from '@/components/data-notices';
import { getBookings } from '@/lib/bff';

export const dynamic = 'force-dynamic';

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

export default async function BookingsPage() {
  const { items, dropped, stale, ageSeconds } = await getBookings();

  return (
    <main>
      <h1>Bookings</h1>
      <StaleNotice stale={stale} ageSeconds={ageSeconds} />
      <IncompleteNotice dropped={dropped} />
      <ul>
        {items.map((booking) => (
          <li key={booking.id}>
            {/* A name we could not resolve costs the name, not the row. */}
            <h2>
              {booking.user?.name ?? <span className="unresolved">Unknown user</span>}
              {' at '}
              {booking.parc?.name ?? <span className="unresolved">an unknown parc</span>}
            </h2>
            <p>
              {formatDate(booking.bookingDate)}
              {booking.comments ? ` — ${booking.comments}` : ''}
            </p>
          </li>
        ))}
      </ul>
    </main>
  );
}
