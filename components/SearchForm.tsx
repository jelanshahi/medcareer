import { CATEGORIES, CATEGORY_LABELS } from '@/lib/taxonomy/categories';
import type { SearchParams } from '@/lib/schemas/search-params';

export function SearchForm({ params }: { params: SearchParams }) {
  return (
    <form method="get" action="/" className="flex flex-wrap gap-3 px-4 py-4">
      <div className="flex min-w-[200px] flex-1 flex-col">
        <label htmlFor="q" className="text-sm text-[var(--color-slate)]">Role or keyword</label>
        <input id="q" name="q" type="search" defaultValue={params.q ?? ''}
          className="mt-1 rounded border border-[var(--color-rule)] px-3 py-2" />
      </div>
      <div className="flex min-w-[160px] flex-col">
        <label htmlFor="city" className="text-sm text-[var(--color-slate)]">City</label>
        <input id="city" name="city" type="text" defaultValue={params.city ?? ''}
          className="mt-1 rounded border border-[var(--color-rule)] px-3 py-2" />
      </div>
      <div className="flex min-w-[160px] flex-col">
        <label htmlFor="category" className="text-sm text-[var(--color-slate)]">Category</label>
        <select id="category" name="category" defaultValue={params.category ?? ''}
          className="mt-1 rounded border border-[var(--color-rule)] px-3 py-2">
          <option value="">All categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
        </select>
      </div>
      <button type="submit"
        className="mt-6 rounded bg-[var(--color-signal)] px-5 py-2 font-semibold text-white">
        Search jobs
      </button>
    </form>
  );
}
