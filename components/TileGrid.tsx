import Link from 'next/link';
import { H2, SECTION, TILE } from '@/lib/ui/styles';

export type Tile = { href: string; label: string; count?: number | string };

/** A titled grid of link tiles — the /browse hub's city and discipline pattern, reused by
 * the /roles, /employers and /salary indexes. Renders nothing when there are no tiles. */
export function TileGrid({ title, tiles, last = false }: { title: string; tiles: Tile[]; last?: boolean }) {
  if (tiles.length === 0) return null;
  return (
    <section className={`${SECTION}${last ? ' pb-[clamp(48px,7vw,80px)]' : ''}`}>
      <h2 className={`m-0 ${H2}`}>{title}</h2>
      <div className="reveal-group mt-4.5 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
        {tiles.map((t) => (
          <Link key={t.href} href={t.href} className={TILE}>
            <span className="text-[17px] font-medium tracking-[-0.012em]">{t.label}</span>
            {t.count !== undefined && (
              <span className="text-[15px] tabular-nums text-[var(--color-meta)]">{t.count}</span>
            )}
          </Link>
        ))}
      </div>
    </section>
  );
}
