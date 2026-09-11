import { SORTS, type SearchParams } from '@/lib/schemas/search-params';
import { HiddenFilterFields } from '@/components/HiddenFilterFields';

const SORT_LABELS: Record<(typeof SORTS)[number], string> = {
  newest: 'Newest first',
  salary: 'Highest pay',
};

/** Keyword + sort bar on /jobs. A real GET form: submitting reloads /jobs
 * with the new query string, so results stay linkable and back/forward work
 * with no client-side script. Facet checkboxes live in a separate form
 * (see FacetGroup / the /jobs page); hidden fields here replicate the
 * current facet selections so this form doesn't clear them on submit. */
export function SearchForm({ params }: { params: SearchParams }) {
  return (
    <form method="get" action="/jobs" className="flex flex-wrap items-end gap-3 px-4 py-4 sm:px-6">
      <HiddenFilterFields city={params.city} category={params.category} employment_type={params.employment_type} />
      <div className="flex min-w-[220px] flex-1 flex-col">
        <label htmlFor="q" className="text-xs font-bold uppercase tracking-wider text-[var(--color-slate)]">
          Role or keyword
        </label>
        <input
          id="q"
          name="q"
          type="search"
          placeholder="Registered nurse, PSW, MLT…"
          defaultValue={params.q ?? ''}
          className="mt-1 border border-[var(--color-ink)] bg-white px-3 py-2"
        />
      </div>
      <div className="flex min-w-[180px] flex-col">
        <label htmlFor="sort" className="text-xs font-bold uppercase tracking-wider text-[var(--color-slate)]">
          Sort by
        </label>
        <select
          id="sort"
          name="sort"
          defaultValue={params.sort}
          className="mt-1 border border-[var(--color-ink)] bg-white px-2.5 py-2"
        >
          {SORTS.map((s) => (
            <option key={s} value={s}>{SORT_LABELS[s]}</option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        className="bg-[var(--color-signal)] px-6 py-2.5 font-display text-lg font-bold uppercase tracking-wide text-white hover:bg-[var(--color-signal-hover)]"
      >
        Search
      </button>
    </form>
  );
}
