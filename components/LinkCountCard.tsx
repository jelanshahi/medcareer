import Link from 'next/link';
import { CARD, H3 } from '@/lib/ui/styles';

export type CountLink = { href: string; label: string; count: number };

/** The v2 canvas's aside card: a title over rows of label + right-aligned
 * count. Renders nothing at all when it has no links, rather than an empty
 * card. */
export function LinkCountCard({ title, items }: { title: string; items: CountLink[] }) {
  if (items.length === 0) return null;

  return (
    <div className={`${CARD} p-5`}>
      <div className={H3}>{title}</div>
      <div className="mt-3 flex flex-col gap-2.5">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex min-h-[36px] items-center justify-between gap-2.5 text-base"
          >
            <span>{item.label}</span>
            <span className="tabular-nums text-[var(--color-meta)]">{item.count}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
