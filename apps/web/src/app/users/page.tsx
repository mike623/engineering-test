import { IncompleteNotice } from '@/components/incomplete-notice';
import { getUsers } from '@/lib/bff';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const { items, dropped } = await getUsers();

  return (
    <main>
      <h1>Users</h1>
      <IncompleteNotice dropped={dropped} />
      <ul>
        {items.map((user) => (
          <li key={user.id}>
            <h2>{user.name}</h2>
            <p>{user.email}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
