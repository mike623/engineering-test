import { IncompleteNotice, StaleNotice } from '@/components/data-notices';
import { getParcs } from '@/lib/bff';

// Rendered per request: the point of the BFF is that it holds the freshest
// payload it can reach, so a build-time snapshot would defeat it.
export const dynamic = 'force-dynamic';

export default async function ParcsPage() {
  const { items, dropped, stale, ageSeconds } = await getParcs();

  return (
    <main>
      <h1>Parcs</h1>
      <StaleNotice stale={stale} ageSeconds={ageSeconds} />
      <IncompleteNotice dropped={dropped} />
      <ul>
        {items.map((parc) => (
          <li key={parc.id}>
            <h2>{parc.name}</h2>
            <p>{parc.description}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
