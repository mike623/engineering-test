import { CreateUserForm } from '@/components/create-user-form';
import { IncompleteNotice, StaleNotice } from '@/components/data-notices';
import { PageHeader, RowCount } from '@/components/page-header';
import { RefreshButton } from '@/components/refresh-button';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { createUserAction } from './actions';
import { getUsers } from '@/lib/bff';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const { items, dropped, stale, ageSeconds } = await getUsers();

  return (
    <main className="mx-auto max-w-4xl">
      <PageHeader action={<RefreshButton resource="/users" page="/users" />} title="Users">
        <RowCount shown={items.length} noun="user" />
      </PageHeader>
      <StaleNotice stale={stale} ageSeconds={ageSeconds} />
      <IncompleteNotice dropped={dropped} />
      <CreateUserForm action={createUserAction} />
      <Card className="overflow-hidden py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-1/3">Name</TableHead>
              <TableHead>Email</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">{user.name}</TableCell>
                <TableCell className="text-muted-foreground">{user.email}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </main>
  );
}
