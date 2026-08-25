import { IncompleteNotice, StaleNotice } from '@/components/data-notices';
import { getUsers } from '@/lib/bff';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const { items, dropped, stale, ageSeconds } = await getUsers();

  return (
    <main>
      <h1>Users</h1>
      <StaleNotice stale={stale} ageSeconds={ageSeconds} />
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
