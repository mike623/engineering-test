import { IncompleteNotice, StaleNotice } from '@/components/data-notices';
import { PageHeader, RowCount } from '@/components/page-header';
import { RefreshButton } from '@/components/refresh-button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getBookings } from '@/lib/bff';

export const dynamic = 'force-dynamic';

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

/** A name we could not resolve costs the name, not the row. */
function Unresolved({ children }: { children: string }) {
  return (
    <Badge variant="outline" className="font-normal text-muted-foreground">
      {children}
    </Badge>
  );
}

export default async function BookingsPage() {
  const { items, dropped, stale, ageSeconds, traceId } = await getBookings();

  return (
    <main className="mx-auto max-w-4xl">
      <PageHeader action={<RefreshButton resource="/bookings" page="/bookings" />} title="Bookings">
        <RowCount shown={items.length} noun="booking" />
      </PageHeader>
      <StaleNotice stale={stale} ageSeconds={ageSeconds} traceId={traceId} />
      <IncompleteNotice dropped={dropped} />
      <Card className="overflow-hidden py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Guest</TableHead>
              <TableHead>Parc</TableHead>
              <TableHead className="whitespace-nowrap">Date</TableHead>
              <TableHead>Comments</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((booking) => (
              <TableRow key={booking.id}>
                <TableCell className="font-medium">
                  {booking.user?.name ?? <Unresolved>Unknown user</Unresolved>}
                </TableCell>
                <TableCell>
                  {booking.parc?.name ?? <Unresolved>Unknown parc</Unresolved>}
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {formatDate(booking.bookingDate)}
                </TableCell>
                <TableCell className="text-muted-foreground">{booking.comments}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </main>
  );
}
