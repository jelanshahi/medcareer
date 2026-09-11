import Link from 'next/link';

export function DisciplineTile({
  href,
  label,
  count,
}: {
  href: string;
  label: string;
  count: number;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-[84px] flex-col gap-1 bg-[var(--color-paper)] px-[18px] pb-4 pt-[18px] text-[var(--color-ink)] no-underline hover:bg-white"
    >
      <span className="font-display text-xl font-semibold leading-tight">{label}</span>
      <span className="text-sm tabular-nums text-[var(--color-slate)]">
        {count} {count === 1 ? 'opening' : 'open'}
      </span>
    </Link>
  );
}
