import Link from 'next/link';
import { TILE } from '@/lib/ui/styles';

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
    <Link href={href} className={TILE}>
      <span className="text-[17px] font-medium tracking-[-0.012em]">{label}</span>
      <span className="text-[15px] tabular-nums text-[var(--color-meta)]">{count}</span>
    </Link>
  );
}
