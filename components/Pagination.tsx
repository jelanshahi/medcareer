import Link from 'next/link';

export function Pagination({
  page, total, pageSize, query,
}: { page: number; total: number; pageSize: number; query: Record<string, string | undefined> }) {
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v) sp.set(k, v);
    sp.set('page', String(p));
    return `/?${sp.toString()}`;
  };

  return (
    <nav aria-label="Pagination" className="flex items-center justify-between px-4 py-6">
      {page > 1
        ? <Link href={href(page - 1)} className="text-[var(--color-signal)] underline">Previous</Link>
        : <span className="text-[var(--color-slate)]">Previous</span>}
      <span className="text-sm text-[var(--color-slate)]">Page {page} of {lastPage}</span>
      {page < lastPage
        ? <Link href={href(page + 1)} className="text-[var(--color-signal)] underline">Next</Link>
        : <span className="text-[var(--color-slate)]">Next</span>}
    </nav>
  );
}
