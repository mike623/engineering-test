import { IncompleteNotice, StaleNotice } from '@/components/data-notices';
import { PageHeader, RowCount } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getParcs } from '@/lib/bff';

// Rendered per request: the point of the BFF is that it holds the freshest
// payload it can reach, so a build-time snapshot would defeat it.
export const dynamic = 'force-dynamic';

export default async function ParcsPage() {
  const { items, dropped, stale, ageSeconds } = await getParcs();

  return (
    <main className="mx-auto max-w-4xl">
      <PageHeader title="Parcs">
        <RowCount shown={items.length} noun="parc" />
      </PageHeader>
      <StaleNotice stale={stale} ageSeconds={ageSeconds} />
      <IncompleteNotice dropped={dropped} />
      <Card className="overflow-hidden py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-1/3">Name</TableHead>
              <TableHead>Description</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((parc) => (
              <TableRow key={parc.id}>
                <TableCell className="font-medium">{parc.name}</TableCell>
                <TableCell className="text-muted-foreground">{parc.description}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </main>
  );
}
