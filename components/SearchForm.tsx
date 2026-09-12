import { SORTS, type SearchParams } from '@/lib/schemas/search-params';
import { HiddenFilterFields } from '@/components/HiddenFilterFields';
import { CONTAINER, FIELD, PILL_PRIMARY } from '@/lib/ui/styles';

const SORT_LABELS: Record<(typeof SORTS)[number], string> = {
  newest: 'Newest first',
  salary: 'Highest pay',
};

/** Keyword + city + sort bar on /jobs, matching the v2 canvas's three-control
 * header. A real GET form: submitting reloads /jobs with a new query string,
 * so results stay linkable and back/forward work with no client-side script.
 *
 * The facet checkboxes live in a separate form in the sidebar, so the hidden
 * fields here replicate the facet selections this form does not render
 * (category, employment type, employer) and the sidebar form replicates the
 * ones it does not render (q, sort, city). Without that, submitting either
 * form would silently clear the other's selections. */
export function SearchForm({ params, cities }: { params: SearchParams; cities: string[] }) {
  return (
    <form method="get" action="/jobs" className={`${CONTAINER} flex flex-wrap items-center gap-2.5 py-4`}>
      <HiddenFilterFields
        category={params.category}
        employment_type={params.employment_type}
        employer={params.employer}
      />

      <div className={`${FIELD} flex flex-1 basis-60 items-center gap-2.5 py-0`}>
        <span aria-hidden="true" className="text-[15px] text-[var(--color-meta)]">⌕</span>
        <label htmlFor="q" className="sr-only">Role or keyword</label>
        <input
          id="q"
          name="q"
          type="search"
          placeholder="Registered nurse, PSW, MLT…"
          defaultValue={params.q ?? ''}
          className="min-w-0 flex-1 border-0 bg-transparent p-0 outline-offset-[6px]"
        />
      </div>

      <label htmlFor="city" className="sr-only">City</label>
      <select id="city" name="city" defaultValue={params.city?.[0] ?? ''} className={`${FIELD} flex-1 basis-[150px]`}>
        <option value="">All of Ontario</option>
        {cities.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>

      <label htmlFor="sort" className="sr-only">Sort by</label>
      <select id="sort" name="sort" defaultValue={params.sort} className={`${FIELD} flex-1 basis-[150px]`}>
        {SORTS.map((s) => <option key={s} value={s}>{SORT_LABELS[s]}</option>)}
      </select>

      <button type="submit" className={PILL_PRIMARY}>Search</button>
    </form>
  );
}
